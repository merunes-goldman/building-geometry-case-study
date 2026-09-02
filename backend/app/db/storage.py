"""Plain SQL over the two tables of docs/DESIGN.md, "Database schema". Rows come back as dicts (see pool.py)."""

import json
from pathlib import Path
from uuid import UUID

from psycopg import AsyncConnection
from psycopg.rows import DictRow
from psycopg.types.json import Jsonb

from app.geometry.massing import Constraints, MassingResult, Polygon, derive, normalize_polygon
from app.models import Option, OptionIn, Site

# --- helpers ------------------------------------------------------------------------------------

_SCHEMA = (Path(__file__).parent / "schema.sql").read_bytes()  # bytes: psycopg types query text as LiteralString


def _option(row: DictRow) -> Option:
    """Metrics and the verdict are not stored: they are derived from the row on every read."""
    constraints = Constraints.model_validate(row)
    result = derive(row["site_polygon"], constraints, row["footprints"])
    return Option.model_validate({**row, "constraints": constraints, "result": result})


# --- startup ------------------------------------------------------------------------------------


async def init(conn: AsyncConnection[DictRow], sites_dir: Path) -> None:
    """Create the tables if needed and seed the template sites into an empty database."""
    if not sites_dir.is_dir():
        raise FileNotFoundError(f"template sites folder not found: {sites_dir}")
    await conn.execute("SELECT pg_advisory_xact_lock(1)")  # several workers start at once; only one seeds
    await conn.execute(_SCHEMA)
    cursor = await conn.execute("SELECT count(*) AS n FROM sites")
    if (row := await cursor.fetchone()) and row["n"] == 0:
        for path in sorted(sites_dir.glob("*.json")):
            data = json.loads(path.read_text())
            if "polygon" in data:  # the example constraints live in the same folder
                await insert_site(conn, data["name"], normalize_polygon(data["polygon"]))


# --- sites --------------------------------------------------------------------------------------


async def insert_site(conn: AsyncConnection[DictRow], name: str, polygon: Polygon) -> Site | None:
    """None when the name is taken: site names are unique."""
    cursor = await conn.execute(
        "INSERT INTO sites (name, polygon) VALUES (%s, %s) ON CONFLICT (name) DO NOTHING RETURNING *",
        (name, Jsonb(polygon)),
    )
    row = await cursor.fetchone()
    return Site.model_validate(row) if row else None


async def list_sites(conn: AsyncConnection[DictRow]) -> list[Site]:
    cursor = await conn.execute("SELECT * FROM sites ORDER BY created_at, name")
    return [Site.model_validate(row) for row in await cursor.fetchall()]


async def get_site(conn: AsyncConnection[DictRow], site_id: UUID) -> Site | None:
    cursor = await conn.execute("SELECT * FROM sites WHERE id = %s", (site_id,))
    row = await cursor.fetchone()
    return Site.model_validate(row) if row else None


# --- options ------------------------------------------------------------------------------------


async def insert_option(conn: AsyncConnection[DictRow], site: Site, body: OptionIn, result: MassingResult) -> Option:
    constraints = body.constraints
    cursor = await conn.execute(
        """
        INSERT INTO options (site_id, parent_id, name, setback_m, floor_to_floor_m, max_height_m, max_floors,
                             site_coverage_ratio, gfa_target_m2, footprints)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING *
        """,
        (
            site.id,
            body.parent_id,
            body.name,
            constraints.setback_m,
            constraints.floor_to_floor_m,
            constraints.max_height_m,
            constraints.max_floors,
            constraints.site_coverage_ratio,
            constraints.gfa_target_m2,
            Jsonb([building.footprint for building in result.buildings]),
        ),
    )
    return _option({**(await cursor.fetchall())[0], "site_polygon": site.polygon})


async def list_options(conn: AsyncConnection[DictRow], site: Site) -> list[Option]:
    cursor = await conn.execute("SELECT * FROM options WHERE site_id = %s ORDER BY created_at, id", (site.id,))
    return [_option({**row, "site_polygon": site.polygon}) for row in await cursor.fetchall()]


async def get_option(conn: AsyncConnection[DictRow], option_id: UUID) -> Option | None:
    cursor = await conn.execute(
        "SELECT o.*, s.polygon AS site_polygon FROM options o JOIN sites s ON s.id = o.site_id WHERE o.id = %s",
        (option_id,),
    )
    row = await cursor.fetchone()
    return _option(row) if row else None


async def get_option_site(conn: AsyncConnection[DictRow], option_id: UUID) -> UUID | None:
    cursor = await conn.execute("SELECT site_id FROM options WHERE id = %s", (option_id,))
    row = await cursor.fetchone()
    return row["site_id"] if row else None
