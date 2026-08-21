from pydantic_settings import BaseSettings, SettingsConfigDict


class Config(BaseSettings):
    # Env vars use the APP_ prefix, e.g. APP_LOG_LEVEL, APP_DATABASE_URL.
    model_config = SettingsConfigDict(env_prefix="APP_")

    log_level: str = "INFO"
    debug: bool = False
    allowed_origins: str = "*"
    # libpq connection string (psycopg). Defaults to the docker-compose `db` service.
    database_url: str = "postgresql://postgres:postgres@localhost:5432/casestudy"
    # Template sites seeded into an empty database; the default is the repo folder seen from backend/.
    sites_dir: str = "../data/sites"
