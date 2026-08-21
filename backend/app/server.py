from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import Config
from app.db import storage
from app.db.pool import create_pool
from app.v1.router import router as v1_router


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    # startup
    await app.state.db_pool.open()
    async with app.state.db_pool.connection() as conn:
        await storage.init(conn, Path(app.state.config.sites_dir))
    yield
    # shutdown
    await app.state.db_pool.close()


def create_app(config: Config) -> FastAPI:
    app = FastAPI(
        title="Building Geometry Case Study",
        version="0.1.0",
        debug=config.debug,
        lifespan=lifespan,
    )

    app.state.config = config
    app.state.db_pool = create_pool(config)

    origins = [o.strip() for o in config.allowed_origins.split(";")]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(v1_router)

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, error: RequestValidationError) -> JSONResponse:
        # One shape for every 422: detail is a single human-readable string (see docs/DESIGN.md, "API contract").
        detail = "; ".join(f"{'.'.join(str(p) for p in e['loc'])}: {e['msg']}" for e in error.errors())
        return JSONResponse({"detail": detail}, status_code=422)

    @app.get("/")
    async def root() -> dict:
        from app import __version__

        return {"status": "ok", "version": __version__}

    return app


def deploy_factory() -> FastAPI:
    config = Config()
    return create_app(config)


def local_factory() -> FastAPI:
    from dotenv import load_dotenv

    load_dotenv()
    config = Config()
    return create_app(config)
