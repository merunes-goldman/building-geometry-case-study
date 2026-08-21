"""Massing: site polygon + constraints -> buildable footprint, metrics, verdict.

Pure functions, no IO. The steps and their rationale are in docs/DESIGN.md, "Algorithm".
"""

import math
from typing import Literal, Self

from pydantic import BaseModel, Field, model_validator
from shapely import Polygon as ShapelyPolygon
from shapely import get_parts
from shapely.geometry.polygon import orient
from shapely.validation import explain_validity

Point = tuple[float, float]
Polygon = list[Point]  # vertices in metres, the first one is not repeated at the end

Verdict = Literal["ok", "gfa_missed", "infeasible"]
Reason = Literal["footprint_collapsed", "zero_floors"]

_SLIVER_M2 = 1.0  # a piece below this area is rounding debris, not a footprint
_AREA_TOLERANCE_M2 = 1e-6  # one square millimetre: part areas closer than this tie
_INSET_PRECISION_M = 1e-3  # binary search step for the coverage inset
_FLOOR_DIVISION_EPS = 1e-9  # 9.6 / 3.2 is 2.999... in floating point and must still give 3 floors


class PolygonError(ValueError):
    """The site polygon is unusable; the message says why."""


class Constraints(BaseModel):
    setback_m: float = Field(ge=0)
    floor_to_floor_m: float = Field(gt=0)
    max_height_m: float | None = Field(default=None, ge=0)
    max_floors: int | None = Field(default=None, ge=0, le=2_147_483_647)  # the range of the integer column
    site_coverage_ratio: float | None = Field(default=None, gt=0, le=1)
    gfa_target_m2: float | None = Field(default=None, gt=0)

    @model_validator(mode="after")
    def at_least_one_limit(self) -> Self:
        if self.max_height_m is None and self.max_floors is None:
            raise ValueError("at least one of max_height_m and max_floors must be set")
        return self


class Metrics(BaseModel):
    footprint_area_m2: float
    floor_count: int
    height_m: float
    gfa_m2: float
    coverage: float
    far: float


class MassingResult(BaseModel):
    footprint: Polygon | None  # None when nothing is left of the footprint
    footprint_split: bool
    metrics: Metrics
    verdict: Verdict
    gfa_shortfall_m2: float | None = None  # set for gfa_missed
    reason: Reason | None = None  # set for infeasible


def _to_shape(polygon: Polygon) -> ShapelyPolygon:
    """Reject a broken polygon with the reason, no silent fixing."""
    if len(polygon) < 3:
        raise PolygonError("a polygon needs at least three vertices")
    shape = ShapelyPolygon(polygon)
    if not shape.is_valid:  # covers self-intersection and zero-area (flat) rings alike
        raise PolygonError(explain_validity(shape))
    return shape


def normalize_polygon(polygon: Polygon) -> Polygon:
    """Validate a site polygon and normalize it: counter-clockwise, no repeated closing vertex."""
    return _to_polygon(_to_shape(polygon))


def _to_polygon(shape: ShapelyPolygon) -> Polygon:
    return [(x, y) for x, y in orient(shape).exterior.coords[:-1]]  # counter-clockwise, like the template sites


def _inset(shape: ShapelyPolygon, distance: float) -> tuple[ShapelyPolygon | None, bool]:
    """Inset with sharp corners, drop slivers, keep one part.

    Returns the kept part (None if nothing is left) and whether the footprint split.
    """
    parts = [p for p in get_parts(shape.buffer(-distance, join_style="mitre")) if p.area >= _SLIVER_M2]
    if not parts:
        return None, False
    largest = max(p.area for p in parts)
    tied = [p for p in parts if p.area >= largest - _AREA_TOLERANCE_M2]
    kept = min(tied, key=lambda p: (p.bounds[0], p.bounds[1]))  # leftmost, then lowest
    return kept, len(parts) > 1


def _compute_footprint(site: ShapelyPolygon, constraints: Constraints) -> tuple[ShapelyPolygon | None, bool]:
    """The setback, then the additional inset for site coverage."""
    footprint, split = _inset(site, constraints.setback_m)
    if footprint is None or constraints.site_coverage_ratio is None:
        return footprint, split
    allowed = constraints.site_coverage_ratio * site.area
    if footprint.area <= allowed:
        return footprint, split
    # Binary search for the smallest inset that brings the area under the limit.
    # Insetting by half of the smaller bounding-box side always leaves nothing, so `hi` fits.
    min_x, min_y, max_x, max_y = footprint.bounds
    lo, hi = 0.0, min(max_x - min_x, max_y - min_y) / 2
    while hi - lo > _INSET_PRECISION_M:
        mid = (lo + hi) / 2
        part, _ = _inset(footprint, mid)
        if part is None or part.area <= allowed:
            hi = mid
        else:
            lo = mid
    part, split_again = _inset(footprint, hi)
    return part, split or split_again


def _floor_count(constraints: Constraints) -> int:
    """The smaller of the floor limit and the floors by height; one limit acts alone."""
    limits: list[int] = []
    if constraints.max_floors is not None:
        limits.append(constraints.max_floors)
    if constraints.max_height_m is not None:
        limits.append(math.floor(constraints.max_height_m / constraints.floor_to_floor_m + _FLOOR_DIVISION_EPS))
    return min(limits)


def derive(site: Polygon, constraints: Constraints, footprint: Polygon | None, split: bool) -> MassingResult:
    """Metrics and verdict for a footprint under the constraints.

    The inputs are trusted: a valid site and a footprint produced by this module.
    """
    site_area = ShapelyPolygon(site).area
    area = ShapelyPolygon(footprint).area if footprint else 0.0
    floors = _floor_count(constraints)
    gfa = area * floors
    metrics = Metrics(
        footprint_area_m2=area,
        floor_count=floors,
        height_m=floors * constraints.floor_to_floor_m,
        gfa_m2=gfa,
        coverage=area / site_area,
        far=gfa / site_area,
    )
    verdict: Verdict = "ok"
    reason: Reason | None = None
    shortfall: float | None = None
    if footprint is None:
        verdict, reason = "infeasible", "footprint_collapsed"
    elif floors == 0:
        verdict, reason = "infeasible", "zero_floors"
    elif constraints.gfa_target_m2 is not None and gfa < constraints.gfa_target_m2:
        verdict, shortfall = "gfa_missed", constraints.gfa_target_m2 - gfa
    return MassingResult(
        footprint=footprint,
        footprint_split=split,
        metrics=metrics,
        verdict=verdict,
        gfa_shortfall_m2=shortfall,
        reason=reason,
    )


def compute_massing(polygon: Polygon, constraints: Constraints) -> MassingResult:
    site = _to_shape(polygon)
    footprint, split = _compute_footprint(site, constraints)
    return derive(polygon, constraints, _to_polygon(footprint) if footprint else None, split)
