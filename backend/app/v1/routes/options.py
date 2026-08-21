from uuid import UUID

from fastapi import APIRouter, HTTPException

from app.db import storage
from app.db.pool import Connection
from app.models import Option

router = APIRouter(prefix="/options", tags=["options"])


@router.get("/{option_id}")
async def get_option(option_id: UUID, conn: Connection) -> Option:
    option = await storage.get_option(conn, option_id)
    if option is None:
        raise HTTPException(404, "option not found")
    return option
