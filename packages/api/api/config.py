from __future__ import annotations

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str
    redis_url: str = "redis://localhost:6379/0"

    jwt_secret: str  # required — fails fast at startup if missing
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 30

    anthropic_api_key: str = ""
    usda_api_key: str = "DEMO_KEY"

    # Field-level encryption for PHI (biometric data).
    # Accepts a comma-separated list of Fernet keys for rotation:
    #   ENCRYPTION_KEY=NEW_KEY,OLD_KEY
    # The first key encrypts new data; all keys can decrypt existing data.
    # Generate: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    encryption_key: str = ""
    encrypt_biometrics: bool = True

    # Comma-separated list of allowed CORS origins.
    # In production, set to your actual domains:
    #   ALLOWED_ORIGINS=https://app.nutrisync.com,https://www.nutrisync.com
    allowed_origins: str = "http://localhost:3000,http://127.0.0.1:3000,http://localhost:19006"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    @field_validator("jwt_secret")
    @classmethod
    def jwt_secret_not_empty(cls, v: str) -> str:
        if not v or len(v) < 16:
            raise ValueError("JWT_SECRET must be at least 16 characters")
        return v

    @field_validator("database_url")
    @classmethod
    def database_url_scheme(cls, v: str) -> str:
        if not v.startswith(("postgresql", "sqlite")):
            raise ValueError("DATABASE_URL must be a PostgreSQL or SQLite connection string")
        return v

    @model_validator(mode="after")
    def warn_missing_keys(self) -> "Settings":
        import logging
        logger = logging.getLogger(__name__)
        if not self.anthropic_api_key:
            logger.warning("ANTHROPIC_API_KEY not set — AI features will be unavailable")
        if self.encrypt_biometrics and not self.encryption_key:
            logger.warning(
                "ENCRYPT_BIOMETRICS=true but ENCRYPTION_KEY is not set — "
                "biometric data will be stored in plaintext"
            )
        return self

    @property
    def origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


settings = Settings()
