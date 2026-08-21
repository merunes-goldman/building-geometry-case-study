from collections.abc import AsyncGenerator
from typing import Annotated

from fastapi import Depends, Request
from psycopg import AsyncConnection
from psycopg.rows import DictRow, dict_row
from psycopg_pool import AsyncConnectionPool

from app.config import Config


def create_pool(config: Config) -> AsyncConnectionPool:
    # open=False: the pool is opened in the app lifespan, not at import time.
    return AsyncConnectionPool(config.database_url, open=False, kwargs={"row_factory": dict_row})


async def connection(request: Request) -> AsyncGenerator[AsyncConnection[DictRow], None]:
    async with request.app.state.db_pool.connection() as conn:
        yield conn


Connection = Annotated[AsyncConnection[DictRow], Depends(connection)]
