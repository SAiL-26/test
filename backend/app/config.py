import logging
import secrets
from pathlib import Path
from pydantic_settings import BaseSettings

logger = logging.getLogger(__name__)
_DEV_DEFAULT_SECRET = "dev-secret-change-me-in-production"


class Settings(BaseSettings):
    app_name: str = "Dental Wave Viz API"
    db_url: str = f"sqlite:///{Path(__file__).resolve().parent.parent / 'dental.sqlite'}"
    jwt_secret: str = _DEV_DEFAULT_SECRET
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://localhost:4173",
        "http://localhost:8765",
    ]
    data_dir: Path = Path(__file__).resolve().parent.parent / "data"
    environment: str = "development"  # "development" | "production"

    # Anthropic Claude API — used by /api/ai/chat (clinical AI dock).
    # Set with: export DENTAL_ANTHROPIC_API_KEY=sk-ant-...
    # When unset, /api/ai/chat returns a stubbed response so the UI stays wired.
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-6"
    anthropic_max_tokens: int = 1024

    class Config:
        env_prefix = "DENTAL_"
        env_file = ".env"


settings = Settings()

if settings.jwt_secret == _DEV_DEFAULT_SECRET:
    if settings.environment == "production":
        # Hard fail: production must supply its own secret.
        raise RuntimeError(
            "DENTAL_JWT_SECRET must be set in production. "
            "Generate one with: python -c 'import secrets; print(secrets.token_urlsafe(48))'"
        )
    logger.warning(
        "Using insecure dev JWT secret. Set DENTAL_JWT_SECRET for any non-local use."
    )

# Helper for ad-hoc secret generation in docs
def generate_secret() -> str:
    return secrets.token_urlsafe(48)
