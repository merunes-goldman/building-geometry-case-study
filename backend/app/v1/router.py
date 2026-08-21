from fastapi import APIRouter

from app.v1.routes.health import router as health_router
from app.v1.routes.massing import router as massing_router
from app.v1.routes.options import router as options_router
from app.v1.routes.sites import router as sites_router

router = APIRouter(prefix="/api/v1")

router.include_router(health_router)
router.include_router(sites_router)
router.include_router(options_router)
router.include_router(massing_router)
