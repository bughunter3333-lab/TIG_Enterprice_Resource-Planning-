"""
Integration tests for /health endpoints and Request-ID middleware.
"""

import pytest


@pytest.mark.integration
class TestHealth:
    def test_liveness_ok(self, client):
        r = client.get("/health")
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "ok"
        assert "timestamp" in data

    def test_readiness_ok(self, client):
        r = client.get("/health/ready")
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "ready"
        assert data["database"] == "ok"
        assert "uptime_seconds" in data

    def test_request_id_generated(self, client):
        r = client.get("/health")
        assert "x-request-id" in r.headers

    def test_request_id_echoed(self, client):
        r = client.get("/health", headers={"X-Request-ID": "test-req-abc123"})
        assert r.headers.get("x-request-id") == "test-req-abc123"

    def test_request_id_on_api_routes(self, client):
        r = client.get("/customers/")
        assert "x-request-id" in r.headers
