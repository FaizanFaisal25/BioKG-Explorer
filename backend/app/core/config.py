from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "BioKG Explorer API"
    api_prefix: str = "/api/v1"
    cors_origins: list[str] = Field(
        default_factory=lambda: [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:5174",
            "http://127.0.0.1:5174",
        ]
    )

    neo4j_uri: str = "bolt://localhost:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = "password"
    neo4j_database: str = "neo4j"

    default_search_limit: int = 10
    max_search_limit: int = 50
    default_neighbor_limit: int = 100
    max_neighbor_limit: int = 500
    default_shortest_path_max_hops: int = 5
    max_shortest_path_hops: int = 10
    gemini_api_key: str | None = None
    google_api_key: str | None = None
    gemini_model: str = "gemini-3.1-flash-lite"
    gemini_max_output_tokens: int = 700
    gemini_temperature: float = 0.25

    model_config = SettingsConfigDict(
        env_file=(".env", "backend/.env"),
        env_file_encoding="utf-8",
        env_prefix="",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
