"""The API's interactive docs are a development convenience, not a public page.

In production they would list every endpoint and payload to anyone. The switch
is ENVIRONMENT, which defaults to "production" — so a deploy that forgets to set
it gets the safe behaviour, not the open one.
"""

import importlib

import pytest
from starlette.testclient import TestClient


def _app_for(monkeypatch, environment):
    monkeypatch.setenv("ENVIRONMENT", environment)
    import app.core.config as config
    import app.main as main

    importlib.reload(config)
    importlib.reload(main)
    return main.app


@pytest.fixture(autouse=True)
def _restore(monkeypatch):
    yield
    monkeypatch.undo()
    import app.core.config as config
    import app.main as main

    importlib.reload(config)
    importlib.reload(main)


@pytest.mark.unit
@pytest.mark.parametrize("path", ["/docs", "/redoc", "/openapi.json"])
def test_production_serves_no_docs(monkeypatch, path):
    client = TestClient(_app_for(monkeypatch, "production"))
    assert client.get(path).status_code == 404


@pytest.mark.unit
def test_development_keeps_them(monkeypatch):
    client = TestClient(_app_for(monkeypatch, "development"))
    assert client.get("/openapi.json").status_code == 200
