from fastapi import APIRouter

from app.db.pool import Connection
from app.geometry.massing import MassingResult, compute_massing
from app.models import PreviewIn
from app.v1.routes.sites import site_or_404

router = APIRouter(prefix="/massing", tags=["massing"])


@router.post("/preview")
async def preview(body: PreviewIn, conn: Connection) -> MassingResult:
    """The same computation as saving an option, without writing anything."""
    site = await site_or_404(conn, body.site_id)
    return compute_massing(site.polygon, body.constraints)
