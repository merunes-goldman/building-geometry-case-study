from uuid import UUID

from fastapi import APIRouter, HTTPException
from psycopg import AsyncConnection
from psycopg.rows import DictRow

from app.db import storage
from app.db.pool import Connection
from app.geometry.massing import PolygonError, compute_massing, normalize_polygon
from app.models import Option, OptionIn, Site, SiteIn

router = APIRouter(prefix="/sites", tags=["sites"])

# --- helpers ------------------------------------------------------------------------------------


async def site_or_404(conn: AsyncConnection[DictRow], site_id: UUID) -> Site:
    site = await storage.get_site(conn, site_id)
    if site is None:
        raise HTTPException(404, "site not found")
    return site


# --- routes -------------------------------------------------------------------------------------


@router.post("", status_code=201)
async def create_site(body: SiteIn, conn: Connection) -> Site:
    try:
        polygon = normalize_polygon(body.polygon)
    except PolygonError as error:
        raise HTTPException(422, str(error)) from error
    return await storage.insert_site(conn, body.name, polygon)


@router.get("")
async def list_sites(conn: Connection) -> list[Site]:
    return await storage.list_sites(conn)


@router.get("/{site_id}")
async def get_site(site_id: UUID, conn: Connection) -> Site:
    return await site_or_404(conn, site_id)


@router.post("/{site_id}/options", status_code=201)
async def create_option(site_id: UUID, body: OptionIn, conn: Connection) -> Option:
    """A root or a branch: the only difference is parent_id. The server computes the massing and saves the result."""
    site = await site_or_404(conn, site_id)
    if body.parent_id is not None:
        parent_site_id = await storage.get_option_site(conn, body.parent_id)
        if parent_site_id is None:
            raise HTTPException(422, "parent_id: no such option")
        if parent_site_id != site_id:
            raise HTTPException(422, "parent_id: an option of another site")
    return await storage.insert_option(conn, site, body, compute_massing(site.polygon, body.constraints))


@router.get("/{site_id}/options")
async def list_options(site_id: UUID, conn: Connection) -> list[Option]:
    """All options of the site as a flat list; the tree is the parent_id links."""
    return await storage.list_options(conn, await site_or_404(conn, site_id))
