# Backend — building geometry case study

FastAPI + uv + async psycopg. This is a scaffold: it runs and exposes a health
check, has the database plumbing wired, and leaves the geometry domain to you.

## Stack

- **[uv](https://docs.astral.sh/uv/)** — package manager
- **FastAPI** — HTTP API under `/api/v1/`
- **pydantic-settings** — config from env vars (`APP_` prefix)
- **psycopg (async) + connection pool** — DB access (pool wired, no schema; you write raw SQL)
- **Typer** — CLI (`serve`, `generate-openapi`)
- **Ruff** + **Pyright** — lint/format + type check

## Getting started

```bash
cp .env.example .env
uv sync --group dev
uv run app serve --reload        # http://localhost:8000  (docs at /docs)
```

A Postgres is expected at `APP_DATABASE_URL`. The easiest way is the root
`docker compose up` (brings up db + backend + frontend together).

## What's here

- `app/server.py` — FastAPI app, CORS, lifespan: opens the pool, applies the schema, seeds the template sites.
- `app/db/` — `pool.py` (async psycopg pool + the `Connection` dependency), `schema.sql` (the two tables,
  applied on every start, idempotent), `storage.py` (plain SQL; seeds an empty database with the template sites
  from `APP_SITES_DIR`). No ORM, no migration tool.
- `app/geometry/massing.py` — the massing algorithm and its types (pure, no IO).
- `app/models.py` — request and response shapes.
- `app/v1/routes/` — `health`, `sites`, `options`, `massing` (preview); the contract is in `docs/DESIGN.md`.

You own: the domain model, the algorithm, the persistence schema (saved options +
the decision tree), migrations, the API contract, and tests.

## Commands

```bash
uv run pytest                              # tests (the API tests use a `casestudy_test` database on the same server)
uv run pytest --cov=app --cov-report=term-missing
uv run ruff check . && uv run ruff format .
uv run pyright
uv run app generate-openapi                # -> docs/openapi.json
```

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `APP_LOG_LEVEL` | `INFO` | Logging level |
| `APP_DEBUG` | `false` | FastAPI debug mode |
| `APP_ALLOWED_ORIGINS` | `*` | CORS origins, semicolon-separated |
| `APP_DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/casestudy` | libpq connection string (psycopg) |
| `APP_SITES_DIR` | `../data/sites` | template sites seeded into an empty database |
