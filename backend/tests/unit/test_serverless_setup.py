"""Running the API as Vercel Functions against Supabase.

Three things a long-running server got away with and a serverless one does not:
holding a connection pool of its own, migrating the database when the process
starts, and a connection string with a percent-encoded password going through
Alembic's ini parser.
"""

import tomllib
from pathlib import Path

import pytest
from alembic.config import Config
from sqlalchemy.pool import NullPool

from app.core.config import for_alembic_ini, migration_database_url
from app.database import engine_options

SUPABASE = "postgresql://postgres.ref:p%40ss@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres"


@pytest.mark.unit
class TestConnections:
    def test_postgres_holds_no_pool_of_its_own(self):
        # Instances are many, short-lived and frozen between requests; the
        # Supabase pooler keeps the real connections.
        assert engine_options(SUPABASE) == {"poolclass": NullPool}

    def test_sqlite_is_as_it_was(self):
        assert engine_options("sqlite:///./dev_local.db") == {
            "pool_pre_ping": True,
            "connect_args": {"check_same_thread": False},
        }


@pytest.mark.unit
class TestMigrationConnection:
    def test_its_own_string_when_one_is_set(self):
        # Migrations go through Supabase's session pooler, the API through the
        # transaction pooler.
        session = SUPABASE.replace(":6543/", ":5432/")
        env = {"MIGRATION_DATABASE_URL": session, "DATABASE_URL": SUPABASE}
        assert migration_database_url(env, SUPABASE) == session

    def test_otherwise_the_api_string(self):
        assert migration_database_url({}, SUPABASE) == SUPABASE
        assert (
            migration_database_url({"MIGRATION_DATABASE_URL": "  "}, SUPABASE)
            == SUPABASE
        )

    def test_a_percent_encoded_password_reaches_alembic_intact(self):
        config = Config()
        with pytest.raises(ValueError):
            config.set_main_option("sqlalchemy.url", SUPABASE)
        config.set_main_option("sqlalchemy.url", for_alembic_ini(SUPABASE))
        assert config.get_main_option("sqlalchemy.url") == SUPABASE


@pytest.mark.unit
class TestMigratingOnDeploy:
    @pytest.fixture
    def ran(self, monkeypatch):
        import migrate_on_deploy

        calls = []
        monkeypatch.setattr(
            migrate_on_deploy.subprocess, "call", lambda args: calls.append(args) or 0
        )
        return migrate_on_deploy, calls

    def test_a_production_build_migrates(self, ran):
        script, calls = ran
        env = {"VERCEL_ENV": "production", "DATABASE_URL": SUPABASE}
        assert script.main(env) == 0
        assert calls and calls[0][-3:] == ["alembic", "upgrade", "head"]

    @pytest.mark.parametrize("where", ["preview", "development", None])
    def test_nothing_else_touches_the_database(self, ran, where):
        script, calls = ran
        env = {"DATABASE_URL": SUPABASE} | ({"VERCEL_ENV": where} if where else {})
        assert script.main(env) == 0
        assert calls == []

    def test_on_vercel_a_build_that_cannot_say_which_it_is_fails(self, ran):
        # Vercel hides VERCEL_ENV when the project stops exposing its system
        # variables; skipping then would put new code on an unmigrated schema.
        script, calls = ran
        env = {"VERCEL": "1", "MIGRATION_DATABASE_URL": SUPABASE}
        assert script.main(env) == 1
        assert calls == []

    def test_a_production_build_with_no_database_fails(self, ran):
        script, calls = ran
        assert script.main({"VERCEL_ENV": "production"}) == 1
        assert calls == []

    def test_a_failed_migration_fails_the_build(self, ran, monkeypatch):
        script, _ = ran
        monkeypatch.setattr(script.subprocess, "call", lambda args: 1)
        env = {"VERCEL_ENV": "production", "DATABASE_URL": SUPABASE}
        assert script.main(env) == 1


@pytest.mark.unit
class TestVercelInstall:
    def test_dependencies_come_from_requirements_txt(self):
        # Vercel's Python build installs from pyproject.toml whenever the
        # deployment has one and reads requirements.txt only when it does not.
        # A pyproject.toml with no [project] table fails the build at `uv lock`,
        # so it has to stay out of the deployment.
        backend = Path(__file__).resolve().parents[2]
        pyproject = tomllib.loads((backend / "pyproject.toml").read_text())
        ignored = [
            line.strip()
            for line in (backend / ".vercelignore").read_text().splitlines()
            if line.strip() and not line.startswith("#")
        ]
        assert "project" in pyproject or "pyproject.toml" in ignored
