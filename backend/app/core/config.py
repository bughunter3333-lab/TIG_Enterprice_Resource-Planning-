from pydantic_settings import BaseSettings
from typing import Optional


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

    class Config:
        env_file = ".env"


settings = Settings()
