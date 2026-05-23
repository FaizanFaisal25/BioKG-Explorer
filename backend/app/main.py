from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.api.routes.graph import router as graph_router
from backend.app.core.config import get_settings
from backend.app.db.neo4j import neo4j_client


@asynccontextmanager
async def lifespan(app: FastAPI):
    neo4j_client.connect()
    yield
    neo4j_client.close()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name, lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(graph_router, prefix=settings.api_prefix)
    return app


app = create_app()
