"""
Application configuration using Pydantic Settings.
Loads from environment variables / .env file.
"""

from functools import lru_cache
from typing import Any
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # App
    APP_NAME: str = "ANS Management Platform"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = False
    ENVIRONMENT: str = "development"
    API_V1_PREFIX: str = "/api/v1"

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://ans_user:ans_password@localhost:5432/ans_platform"
    SQL_ECHO: bool = False
    DB_POOL_SIZE: int = 20
    DB_MAX_OVERFLOW: int = 10
    DB_POOL_TIMEOUT: int = 30

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # RabbitMQ
    RABBITMQ_URL: str = "amqp://ans_rabbit:ans_rabbit_pass@localhost:5672/"

    # IMAP (Email Polling)
    IMAP_HOST: str = "imap.gmail.com"
    IMAP_PORT: int = 993
    IMAP_USERNAME: str = ""
    IMAP_PASSWORD: str = ""
    IMAP_MAILBOX: str = "INBOX"
    IMAP_USE_SSL: bool = True

    # Email Processing
    DEFAULT_COMPANY_ID: str = ""
    EMAIL_POLL_INTERVAL_SECONDS: int = 120

    # MinIO
    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str = "ans_minio"
    MINIO_SECRET_KEY: str = "ans_minio_password"
    MINIO_SECURE: bool = False
    # Add alongside the other MINIO fields:
    MINIO_BUCKET: str = "email-attachments"
    MINIO_USE_SSL: bool = False

    # Keycloak
    KEYCLOAK_URL: str = "http://localhost:8080"
    KEYCLOAK_REALM: str = "oniverse"
    KEYCLOAK_CLIENT_ID: str = "ans-backend"
    KEYCLOAK_CLIENT_SECRET: str = ""

    # Public URL as the browser sees it (must match the token's "iss")
    KEYCLOAK_PUBLIC_URL: str = "http://localhost:8080/auth"
    # Internal URL for backend → Keycloak calls (Docker network)
    KEYCLOAK_INTERNAL_URL: str = "http://keycloak:8080/auth"

    @property
    def keycloak_issuer(self) -> str:
        """Token issuer — must match the 'iss' claim exactly."""
        return f"{self.KEYCLOAK_PUBLIC_URL}/realms/{self.KEYCLOAK_REALM}"

    @property
    def keycloak_jwks_url(self) -> str:
        """JWKS endpoint — fetched over the internal network in Docker."""
        return f"{self.KEYCLOAK_INTERNAL_URL}/realms/{self.KEYCLOAK_REALM}/protocol/openid-connect/certs"

    # Keycloak Admin Credentials
    KC_BOOTSTRAP_ADMIN_USERNAME: str = "admin"
    KC_BOOTSTRAP_ADMIN_PASSWORD: str = "DevKcAdmin#2026"
    PORTAL_URL: str = "http://localhost:3000"

    # Outbound SMTP Email Settings
    SMTP_HOST: str = "mailpit"
    SMTP_PORT: int = 1025
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM_EMAIL: str = "Oniverse ASN Portal <no-reply@oniverse.lk>"
    SMTP_USE_TLS: bool = False

    # CORS
    CORS_ORIGINS: list[str] | str = [
        "http://localhost:3000",
        "http://localhost:80",
    ]

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Any) -> list[str]:
        if isinstance(v, str):
            v_clean = v.strip()
            if v_clean.startswith("["):
                import json
                return json.loads(v_clean)
            return [i.strip() for i in v_clean.split(",") if i.strip()]
        return v

    # Logging
    LOG_LEVEL: str = "INFO"


@lru_cache
def get_settings() -> Settings:
    return Settings()