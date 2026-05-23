from collections.abc import Generator

from neo4j import Driver, GraphDatabase

from backend.app.core.config import Settings, get_settings


class Neo4jClient:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.driver: Driver | None = None

    def connect(self) -> None:
        if self.driver is None:
            self.driver = GraphDatabase.driver(
                self.settings.neo4j_uri,
                auth=(self.settings.neo4j_user, self.settings.neo4j_password),
            )
            self.driver.verify_connectivity()

    def close(self) -> None:
        if self.driver is not None:
            self.driver.close()
            self.driver = None

    def get_driver(self) -> Driver:
        if self.driver is None:
            self.connect()
        if self.driver is None:
            raise RuntimeError("Neo4j driver was not initialized")
        return self.driver


neo4j_client = Neo4jClient(get_settings())


def get_neo4j_driver() -> Generator[Driver, None, None]:
    yield neo4j_client.get_driver()
