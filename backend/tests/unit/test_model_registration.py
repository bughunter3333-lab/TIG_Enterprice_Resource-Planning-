"""Every model file must reach ``Base.metadata``.

Alembic autogenerate diffs the live database against ``Base.metadata`` and treats
a table it cannot see as one to drop, so an unregistered model is a data-loss
hazard rather than a missing feature. ``admin_setting`` was in exactly that state
until the barrel started scanning the package.
"""

import pkgutil
from importlib import import_module

import pytest

import app.models
from app.database import Base


def _model_modules():
    return [
        m.name
        for m in pkgutil.iter_modules(app.models.__path__)
        if not m.name.startswith("_")
    ]


@pytest.mark.unit
class TestModelRegistration:
    def test_every_model_module_declares_a_table(self):
        """A file under app/models/ that maps nothing is either dead or a typo."""
        registered = set(Base.metadata.tables)
        missing = []
        for name in _model_modules():
            module = import_module(f"app.models.{name}")
            tables = {
                getattr(obj, "__tablename__")
                for obj in vars(module).values()
                if isinstance(obj, type)
                and hasattr(obj, "__tablename__")
                and getattr(obj, "__module__", None) == module.__name__
            }
            if not tables & registered:
                missing.append(name)
        assert not missing, (
            "model modules contribute no table to Base.metadata: "
            f"{missing}. Alembic autogenerate would propose dropping their tables."
        )

    def test_admin_settings_is_registered(self):
        """Regression: this table existed in the DB but not in the metadata."""
        assert "admin_settings" in Base.metadata.tables

    def test_scan_finds_every_module_on_disk(self):
        """Guards the scan itself — an empty walk would make the test above vacuous."""
        assert len(_model_modules()) >= 20
