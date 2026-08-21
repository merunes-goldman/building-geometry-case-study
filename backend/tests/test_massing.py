"""The test plan is docs/DESIGN.md, "Tests": template sites, answers computed by hand."""

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.geometry.massing import Constraints, Polygon, PolygonError, compute_massing, derive

# --- helpers: template data and small readers ---------------------------------------------------

_SITES = Path(__file__).resolve().parents[2] / "data" / "sites"


def _site(name: str) -> Polygon:
    return [(x, y) for x, y in json.loads((_SITES / f"{name}.json").read_text())["polygon"]]


def _example(name: str, **overrides: float | None) -> Constraints:
    sets = json.loads((_SITES / "constraints.example.json").read_text())["examples"]
    fields = {k: v for k, v in next(s for s in sets if s["name"] == name).items() if k not in ("name", "comment")}
    return Constraints(**{**fields, **overrides})


def _bounds(polygon: Polygon) -> tuple[float, float, float, float]:
    xs, ys = [x for x, _ in polygon], [y for _, y in polygon]
    return min(xs), min(ys), max(xs), max(ys)


def _floors(constraints: Constraints) -> int:
    return compute_massing(_site("rectangle"), constraints).metrics.floor_count


# --- tests --------------------------------------------------------------------------------------


def test_rectangle_modest_set():
    # 40x25 site, 3 m setback: a 34x19 = 646 sq. m footprint; 60% coverage allows 600 sq. m.
    result = compute_massing(_site("rectangle"), _example("modest"))
    assert result.footprint is not None and not result.footprint_split
    area = result.metrics.footprint_area_m2
    assert 600 - 0.2 <= area <= 600  # "not above the limit", reached from below in millimetre steps
    assert result.metrics.floor_count == 6  # min(6, floor(24 / 3.5) = 6)
    assert result.metrics.height_m == pytest.approx(21)
    assert result.metrics.gfa_m2 == pytest.approx(area * 6)
    assert result.metrics.coverage == pytest.approx(area / 1000)
    assert result.verdict == "ok"


def test_rectangle_without_coverage_is_exact():
    result = compute_massing(_site("rectangle"), _example("modest", site_coverage_ratio=None))
    assert result.footprint is not None
    assert result.metrics.footprint_area_m2 == pytest.approx(646)
    assert result.footprint == [(3, 3), (37, 3), (37, 22), (3, 22)]  # the example in DESIGN.md, "API contract"
    assert result.metrics.gfa_m2 == pytest.approx(3876)
    assert result.metrics.far == pytest.approx(3.876)


def test_l_shaped_inset_keeps_the_reflex_corner_sharp():
    # Arms after a 3 m setback: 34x9 + 14x15 = 516 sq. m; a sharp inner corner keeps six vertices.
    result = compute_massing(_site("l-shaped"), _example("modest", site_coverage_ratio=None))
    assert result.footprint is not None and not result.footprint_split
    assert result.metrics.footprint_area_m2 == pytest.approx(516)
    assert len(result.footprint) == 6


def test_notched_moderate_setback_splits_and_keeps_the_leftmost_part():
    # A 4 m setback eats the 6 m neck; the two 12x12 parts tie, so the leftmost one is kept.
    result = compute_massing(_site("notched"), _example("modest", setback_m=4, site_coverage_ratio=None))
    assert result.footprint is not None and result.footprint_split
    assert result.metrics.footprint_area_m2 == pytest.approx(144)
    assert _bounds(result.footprint) == (4, 4, 16, 16)
    assert result.verdict == "ok"


def test_split_keeps_the_largest_part():
    # The notched site cannot tell the largest part from the leftmost one; an asymmetric site can.
    polygon: Polygon = [(0, 0), (60, 0), (60, 20), (30, 20), (30, 6), (20, 6), (20, 20), (0, 20)]
    result = compute_massing(polygon, _example("modest", setback_m=4, site_coverage_ratio=None))
    assert result.footprint is not None and result.footprint_split
    assert result.metrics.footprint_area_m2 == pytest.approx(22 * 12)
    assert _bounds(result.footprint) == (34, 4, 56, 16)


def test_coverage_inset_can_split_the_footprint_too():
    # The 0.5 m setback keeps the 1.5 m neck; the extra inset for 60% coverage (498 of 830 sq. m) cuts it.
    polygon: Polygon = [(0, 0), (60, 0), (60, 20), (40, 20), (40, 1.5), (20, 1.5), (20, 20), (0, 20)]
    result = compute_massing(
        polygon, Constraints(setback_m=0.5, floor_to_floor_m=3, max_floors=3, site_coverage_ratio=0.6)
    )
    assert result.footprint_split
    area = result.metrics.footprint_area_m2
    assert 342.25 - 0.1 <= area <= 342.25  # the area jumps to the 18.5x18.5 left part, well under the limit


def test_twelve_metre_setback_depends_on_the_site():
    notched = compute_massing(_site("notched"), _example("infeasible"))
    assert notched.verdict == "infeasible" and notched.reason == "footprint_collapsed"
    assert notched.footprint is None and notched.metrics.gfa_m2 == 0

    rectangle = compute_massing(_site("rectangle"), _example("infeasible"))
    assert rectangle.verdict == "ok"
    assert rectangle.metrics.footprint_area_m2 == pytest.approx(16)  # a 16x1 strip
    assert rectangle.metrics.floor_count == 2  # min(3, floor(10 / 3.5) = 2)


def test_coverage_limit_below_the_sliver_threshold_destroys_the_footprint():
    result = compute_massing(_site("rectangle"), _example("modest", site_coverage_ratio=0.0005))
    assert result.verdict == "infeasible" and result.reason == "footprint_collapsed"


def test_slivers_are_removed_before_the_split_analysis():
    # A 20x20 body, a 1.5 m wide neck and a 2.5x2.5 m knob: a 1 m inset leaves the body and a 0.25 sq. m sliver.
    polygon: Polygon = [(0, 0), (20, 0), (20, 9.25), (22, 9.25), (22, 8.75), (24.5, 8.75), (24.5, 11.25)]
    polygon += [(22, 11.25), (22, 10.75), (20, 10.75), (20, 20), (0, 20)]
    result = compute_massing(polygon, Constraints(setback_m=1, floor_to_floor_m=3, max_floors=3))
    assert not result.footprint_split  # the sliver is not a part, so there is no false split
    assert result.metrics.footprint_area_m2 == pytest.approx(324)


def test_no_floor_fits():
    result = compute_massing(_site("rectangle"), _example("modest", max_height_m=3))
    assert result.verdict == "infeasible" and result.reason == "zero_floors"
    assert result.footprint is not None  # the footprint exists and is kept


def test_gfa_target_above_the_reachable_maximum():
    result = compute_massing(_site("rectangle"), _example("modest", site_coverage_ratio=None, gfa_target_m2=4000))
    assert result.verdict == "gfa_missed"
    assert result.gfa_shortfall_m2 == pytest.approx(4000 - 3876)


def test_coverage_and_gfa_target_together():
    # "tower" on the L-shaped site: a 5 m setback leaves 300 sq. m (under the 45% cap), 20 floors, GFA 6000 of 9000.
    result = compute_massing(_site("l-shaped"), _example("tower"))
    assert result.verdict == "gfa_missed"
    assert result.gfa_shortfall_m2 == pytest.approx(3000)


@pytest.mark.parametrize(
    "polygon",
    [
        [(0, 0), (10, 10), (10, 0), (0, 10)],  # figure eight
        [(0, 0), (10, 0)],  # two vertices
        [(0, 0), (1, 1), (2, 2)],  # zero area
    ],
)
def test_broken_polygons_are_rejected_with_a_reason(polygon: Polygon):
    with pytest.raises(PolygonError) as error:
        compute_massing(polygon, _example("modest"))
    assert str(error.value)


def test_floor_division_tolerance():
    assert _floors(Constraints(setback_m=0, floor_to_floor_m=3.2, max_height_m=9.6)) == 3
    assert _floors(Constraints(setback_m=0, floor_to_floor_m=3.5, max_height_m=24)) == 6


def test_one_limit_acts_alone_and_at_least_one_is_required():
    assert _floors(Constraints(setback_m=0, floor_to_floor_m=3, max_floors=5)) == 5
    assert _floors(Constraints(setback_m=0, floor_to_floor_m=3, max_height_m=7)) == 2
    with pytest.raises(ValidationError):
        Constraints(setback_m=0, floor_to_floor_m=3)


def test_read_time_derivation_matches_a_fresh_computation():
    polygon, constraints = _site("l-shaped"), _example("tower")
    fresh = compute_massing(polygon, constraints)
    assert derive(polygon, constraints, fresh.footprint, fresh.footprint_split) == fresh
