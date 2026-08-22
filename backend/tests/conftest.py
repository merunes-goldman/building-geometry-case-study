"""Shared fixtures: a test database of its own next to the dev one, the app with its lifespan, an HTTP client."""

from collections.abc import AsyncGenerator
from pathlib import Path

import psycopg
import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.config import Config
from app.server import create_app

# --- helpers ------------------------------------------------------------------------------------

_SITES_DIR = Path(__file__).resolve().parents[2] / "data" / "sites"
_SERVER = Config().database_url.rsplit("/", 1)[0]
_TEST_DATABASE_URL = f"{_SERVER}/casestudy_test"


def make_app() -> FastAPI:
    return create_app(Config(database_url=_TEST_DATABASE_URL, sites_dir=str(_SITES_DIR)))


# --- fixtures -----------------------------------------------------------------------------------


@pytest.fixture(scope="session")
def test_database() -> None:
    with psycopg.connect(f"{_SERVER}/postgres", autocommit=True) as conn:
        if conn.execute("SELECT 1 FROM pg_database WHERE datname = 'casestudy_test'").fetchone() is None:
            conn.execute("CREATE DATABASE casestudy_test")


@pytest.fixture
async def client(test_database: None) -> AsyncGenerator[AsyncClient, None]:
    with psycopg.connect(_TEST_DATABASE_URL, autocommit=True) as conn:  # every test starts from an empty database
        conn.execute("DROP TABLE IF EXISTS options, sites")
    app = make_app()
    transport = ASGITransport(app=app)
    async with (
        app.router.lifespan_context(app),
        AsyncClient(transport=transport, base_url="http://test/api/v1") as client,
    ):
        yield client
