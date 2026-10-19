from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Mapping, Optional


class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    TOTP_ISSUER: str = "TotalImageERP"
    ENVIRONMENT: str = "production"
    ANTHROPIC_API_KEY: Optional[str] = None
    # Comma-separated list of browser origins allowed to make credentialed
    # cross-origin requests. Override per environment via the CORS_ORIGINS env var.
    CORS_ORIGINS: str = (
        "http://localhost:3000,http://localhost:5173,https://erp.totalimage.com.au"
    )

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT.lower() == "production"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    model_config = SettingsConfigDict(env_file=".env")


settings = Settings()


def migration_database_url(environ: Mapping[str, str], database_url: str) -> str:
    """The connection Alembic migrates through.

    On Vercel the API reaches Supabase through its transaction pooler (many
    short-lived connections); Supabase points migrations at a session, so
    `MIGRATION_DATABASE_URL` carries the session pooler's string when it is
    set. Without it, the API's own string is used.
    """
    return (environ.get("MIGRATION_DATABASE_URL") or "").strip() or database_url


def for_alembic_ini(url: str) -> str:
    """A connection string as Alembic's ini parser needs it.

    The parser reads `%` as the start of a substitution, so a password with a
    percent-encoded character in it (`@` is written `%40`) stopped every
    migration with an interpolation error.
    """
    return url.replace("%", "%%")
