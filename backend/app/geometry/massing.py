"""Massing: site polygon + constraints -> buildings (one footprint each), metrics, verdict.

Pure functions, no IO. The steps and their rationale are in docs/DESIGN.md, "Algorithm".
"""

import math
from typing import Literal, Self

from pydantic import BaseModel, Field, model_validator
from shapely import MultiPolygon, get_parts
from shapely import Polygon as ShapelyPolygon
from shapely.geometry.polygon import orient
from shapely.validation import explain_validity

Point = tuple[float, float]
Polygon = list[Point]  # vertices in metres, the first one is not repeated at the end

Verdict = Literal["ok", "gfa_missed", "infeasible"]
Reason = Literal["footprint_collapsed", "zero_floors"]

_SLIVER_M2 = 1.0  # a piece below this area is rounding debris, not a footprint
_INSET_PRECISION_M = 1e-3  # binary search step for the coverage inset
_INSET_SEARCH_STEPS = 64  # halvings: millimetres from any real size, and a hard stop where floats cannot halve further
_FLOOR_DIVISION_EPS = 1e-9  # 9.6 / 3.2 is 2.999... in floating point and must still give 3 floors
_MAX_FLOORS = 2_147_483_647  # the range of the integer column


class PolygonError(ValueError):
    """The site polygon is unusable; the message says why."""


class Constraints(BaseModel):
    # Infinity and NaN pass the bound checks and would crash the geometry, hence allow_inf_nan=False.
    setback_m: float = Field(ge=0, allow_inf_nan=False)
    floor_to_floor_m: float = Field(gt=0, allow_inf_nan=False)
    max_height_m: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    max_floors: int | None = Field(default=None, ge=0, le=_MAX_FLOORS)
    site_coverage_ratio: float | None = Field(default=None, gt=0, le=1, allow_inf_nan=False)
    gfa_target_m2: float | None = Field(default=None, gt=0, allow_inf_nan=False)

    @model_validator(mode="after")
    def at_least_one_limit(self) -> Self:
        if self.max_height_m is None and self.max_floors is None:
            raise ValueError("at least one of max_height_m and max_floors must be set")
        return self


class Building(BaseModel):
    footprint: Polygon
    footprint_area_m2: float


class Metrics(BaseModel):
    building_count: int
    footprint_area_m2: float  # all buildings together
    floor_count: int
    height_m: float
    gfa_m2: float
    coverage: float
    far: float


class MassingResult(BaseModel):
    buildings: list[Building]  # leftmost first, then lowest; empty when nothing is left of the footprint
    metrics: Metrics
    verdict: Verdict
    gfa_shortfall_m2: float | None = None  # set for gfa_missed
    reason: Reason | None = None  # set for infeasible


def _to_shape(polygon: Polygon) -> ShapelyPolygon:
    """Reject a broken polygon with the reason, no silent fixing."""
    if len({tuple(point) for point in polygon}) < 3:
        raise PolygonError("a polygon needs at least three distinct vertices")
    shape = ShapelyPolygon(polygon)
    if not shape.is_valid:  # self-intersections, flat rings
        raise PolygonError(explain_validity(shape))
    # Coordinates beyond double precision make the area underflow to zero or overflow to infinity.
    if not math.isfinite(shape.area) or shape.area <= 0:
        raise PolygonError("the polygon's area is zero or not a finite number")
    return shape


def normalize_polygon(polygon: Polygon) -> Polygon:
    """Validate a site polygon and normalize it: counter-clockwise, no repeated closing vertex."""
    return _to_polygon(_to_shape(polygon))


def _to_polygon(shape: ShapelyPolygon) -> Polygon:
    return [(x, y) for x, y in orient(shape).exterior.coords[:-1]]  # counter-clockwise, like the template sites


def _inset(shape: ShapelyPolygon | MultiPolygon, distance: float) -> list[ShapelyPolygon]:
    """Inset with sharp corners and drop slivers; the parts leftmost first, then lowest."""
    parts = [part for part in get_parts(shape.buffer(-distance, join_style="mitre")) if part.area >= _SLIVER_M2]
    return sorted(parts, key=lambda part: (part.bounds[0], part.bounds[1]))


def _area(parts: list[ShapelyPolygon]) -> float:
    return sum(part.area for part in parts)


def _compute_footprints(site: ShapelyPolygon, constraints: Constraints) -> list[ShapelyPolygon]:
    """The setback, then the additional inset for site coverage; one part per building."""
    parts = _inset(site, constraints.setback_m)
    if not parts or constraints.site_coverage_ratio is None:
        return parts
    allowed = constraints.site_coverage_ratio * site.area
    if _area(parts) <= allowed:
        return parts
    # Binary search for the smallest inset that brings the total area under the limit.
    # Insetting by half of the smaller bounding-box side always leaves nothing, so `hi` fits.
    # The step count is capped: on an astronomic site the halving stalls at float precision short of the tolerance.
    footprint = MultiPolygon(parts)
    min_x, min_y, max_x, max_y = footprint.bounds
    lo, hi = 0.0, min(max_x - min_x, max_y - min_y) / 2
    for _step in range(_INSET_SEARCH_STEPS):
        if hi - lo <= _INSET_PRECISION_M:
            break
        mid = (lo + hi) / 2
        if _area(_inset(footprint, mid)) <= allowed:
            hi = mid
        else:
            lo = mid
    return _inset(footprint, hi)


def _floor_count(constraints: Constraints) -> int:
    """The smaller of the floor limit and the floors by height; one limit acts alone."""
    limits: list[int] = []
    if constraints.max_floors is not None:
        limits.append(constraints.max_floors)
    if constraints.max_height_m is not None:
        by_height = constraints.max_height_m / constraints.floor_to_floor_m + _FLOOR_DIVISION_EPS
        limits.append(math.floor(min(by_height, _MAX_FLOORS)))  # a huge ratio is clipped, not overflowed
    return min(limits)


def derive(site: Polygon, constraints: Constraints, footprints: list[Polygon]) -> MassingResult:
    """Buildings, metrics and verdict for the footprints under the constraints.

    The inputs are trusted: a valid site and footprints produced by this module.
    """
    site_area = ShapelyPolygon(site).area
    buildings = [
        Building(footprint=footprint, footprint_area_m2=ShapelyPolygon(footprint).area) for footprint in footprints
    ]
    area = sum(building.footprint_area_m2 for building in buildings)
    floors = _floor_count(constraints)
    gfa = area * floors
    metrics = Metrics(
        building_count=len(buildings),
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
    if not buildings:
        verdict, reason = "infeasible", "footprint_collapsed"
    elif floors == 0:
        verdict, reason = "infeasible", "zero_floors"
    elif constraints.gfa_target_m2 is not None and gfa < constraints.gfa_target_m2:
        verdict, shortfall = "gfa_missed", constraints.gfa_target_m2 - gfa
    return MassingResult(
        buildings=buildings,
        metrics=metrics,
        verdict=verdict,
        gfa_shortfall_m2=shortfall,
        reason=reason,
    )


def compute_massing(polygon: Polygon, constraints: Constraints) -> MassingResult:
    site = _to_shape(polygon)
    return derive(polygon, constraints, [_to_polygon(part) for part in _compute_footprints(site, constraints)])
