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

    def test_api_answers_are_never_stored(self, client):
        # The API is reached through the frontend host's rewrite (Vercel), whose
        # CDN may keep a proxied answer for the next caller. One person's data
        # must never be served to another, so nothing the API says is stored.
        for r in (
            client.get("/customers/"),
            client.get("/health"),
            client.get("/no-such-route"),
        ):
            assert r.headers.get("cache-control") == "no-store"

    def test_lists_are_sent_compressed(self, client, make_customer):
        # Lists are re-fetched every minute by every open screen, through two
        # hosts that meter what they carry (the API's and the frontend's).
        for n in range(20):
            make_customer(id=f"GZ{n:03d}", name=f"Compressed Customer {n}")
        r = client.get("/customers", headers={"Accept-Encoding": "gzip"})
        assert r.status_code == 200
        assert r.headers.get("content-encoding") == "gzip"
        assert len(r.json()) >= 20
        # An answer too small to gain from it is left alone.
        small = client.get("/health", headers={"Accept-Encoding": "gzip"})
        assert "content-encoding" not in small.headers


@pytest.mark.integration
class TestImportSize:
    def test_a_csv_too_big_for_the_host_is_refused_by_the_api_itself(self, client):
        # Vercel refuses a request body over 4.5 MB with its own error page, so
        # the API's limit sits below it and says so in words.
        big = b"id,name\n" + b"x" * (4 * 1024 * 1024)
        r = client.post(
            "/import/customers", files={"file": ("customers.csv", big, "text/csv")}
        )
        assert r.status_code == 413
        assert r.json()["detail"] == "File too large (max 4 MB)"
