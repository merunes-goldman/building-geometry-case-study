"""The API-layer tests from docs/DESIGN.md, "Tests"."""

from uuid import uuid4

from httpx import AsyncClient

from tests.conftest import make_app

# --- helpers ------------------------------------------------------------------------------------

_RECTANGLE = [[0, 0], [40, 0], [40, 25], [0, 25]]
_MODEST = {"setback_m": 3, "floor_to_floor_m": 3.5, "max_height_m": 24, "max_floors": 6, "site_coverage_ratio": 0.6}
_INFEASIBLE = {
    "setback_m": 12,
    "floor_to_floor_m": 3.5,
    "max_height_m": 10,
    "max_floors": 3,
    "site_coverage_ratio": 0.5,
}


async def _site_id(client: AsyncClient, name: str) -> str:
    return next(s["id"] for s in (await client.get("/sites")).json() if s["name"] == name)


# --- tests --------------------------------------------------------------------------------------


async def test_template_sites_are_seeded_once(client: AsyncClient):
    sites = (await client.get("/sites")).json()
    assert [s["name"] for s in sites] == ["l-shaped", "notched", "rectangle"]
    app = make_app()  # a second start against the same database does not seed again
    async with app.router.lifespan_context(app):
        pass
    assert len((await client.get("/sites")).json()) == 3


async def test_create_a_site_a_root_a_branch_and_read_the_tree(client: AsyncClient):
    created = await client.post("/sites", json={"name": "plot", "polygon": _RECTANGLE})
    assert created.status_code == 201
    site_id = created.json()["id"]
    assert (await client.get(f"/sites/{site_id}")).json()["polygon"] == _RECTANGLE

    response = await client.post(f"/sites/{site_id}/options", json={"name": "baseline", "constraints": _MODEST})
    assert response.status_code == 201
    root = response.json()
    assert root["parent_id"] is None and root["result"]["verdict"] == "ok"
    assert root["result"]["metrics"]["floor_count"] == 6
    assert 600 - 0.2 <= root["result"]["metrics"]["footprint_area_m2"] <= 600

    body = {"parent_id": root["id"], "constraints": {**_MODEST, "max_floors": 4}}
    response = await client.post(f"/sites/{site_id}/options", json=body)
    assert response.status_code == 201
    branch = response.json()
    assert branch["parent_id"] == root["id"] and branch["result"]["metrics"]["floor_count"] == 4

    tree = (await client.get(f"/sites/{site_id}/options")).json()
    assert [o["id"] for o in tree] == [root["id"], branch["id"]]  # a flat list; the tree is the parent links
    assert (await client.get(f"/options/{branch['id']}")).json() == branch  # derived on read, the same answer


async def test_a_site_polygon_is_normalized_on_write(client: AsyncClient):
    closed_clockwise = [[0, 0], [0, 25], [40, 25], [40, 0], [0, 0]]
    site = (await client.post("/sites", json={"name": "plot", "polygon": closed_clockwise})).json()
    assert site["polygon"] == _RECTANGLE  # counter-clockwise, without the repeated first vertex


async def test_an_infeasible_result_is_saved_like_any_other(client: AsyncClient):
    site_id = await _site_id(client, "notched")
    option = (await client.post(f"/sites/{site_id}/options", json={"constraints": _INFEASIBLE})).json()
    assert option["result"]["verdict"] == "infeasible" and option["result"]["reason"] == "footprint_collapsed"
    assert option["result"]["footprint"] is None
    assert (await client.get(f"/options/{option['id']}")).status_code == 200


async def test_preview_computes_without_writing(client: AsyncClient):
    site_id = await _site_id(client, "rectangle")
    preview = await client.post("/massing/preview", json={"site_id": site_id, "constraints": _MODEST})
    assert preview.status_code == 200 and preview.json()["verdict"] == "ok"
    assert (await client.get(f"/sites/{site_id}/options")).json() == []


async def test_input_errors_are_422(client: AsyncClient):
    site_id = await _site_id(client, "rectangle")
    other_site_id = await _site_id(client, "notched")

    broken = await client.post("/sites", json={"name": "eight", "polygon": [[0, 0], [10, 10], [10, 0], [0, 10]]})
    assert broken.status_code == 422 and "Self-intersection" in broken.json()["detail"]

    bad_value = await client.post(f"/sites/{site_id}/options", json={"constraints": {**_MODEST, "setback_m": -1}})
    assert bad_value.status_code == 422 and "setback_m" in bad_value.json()["detail"]  # one string, like the others

    too_many = await client.post(f"/sites/{site_id}/options", json={"constraints": {**_MODEST, "max_floors": 10**12}})
    assert too_many.status_code == 422  # the integer column's range, declared rather than a 500

    no_limit = await client.post(
        f"/sites/{site_id}/options", json={"constraints": {"setback_m": 1, "floor_to_floor_m": 3}}
    )
    assert no_limit.status_code == 422

    parent = (await client.post(f"/sites/{other_site_id}/options", json={"constraints": _MODEST})).json()
    foreign = await client.post(f"/sites/{site_id}/options", json={"parent_id": parent["id"], "constraints": _MODEST})
    assert foreign.status_code == 422 and "another site" in foreign.json()["detail"]

    unknown = await client.post(f"/sites/{site_id}/options", json={"parent_id": str(uuid4()), "constraints": _MODEST})
    assert unknown.status_code == 422 and "no such option" in unknown.json()["detail"]


async def test_unknown_ids_are_404(client: AsyncClient):
    missing = uuid4()
    assert (await client.get(f"/sites/{missing}")).status_code == 404
    assert (await client.get(f"/sites/{missing}/options")).status_code == 404
    assert (await client.get(f"/options/{missing}")).status_code == 404
    preview = await client.post("/massing/preview", json={"site_id": str(missing), "constraints": _MODEST})
    assert preview.status_code == 404
