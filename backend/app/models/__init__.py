"""Importing this package registers every model on ``Base.metadata``.

``alembic/env.py`` does nothing but ``import app.models`` before handing
``Base.metadata`` to autogenerate. A model missing from that registration is
therefore invisible to Alembic — and an unseen table does not read as "leave it
alone", it reads as one to DROP.

That already happened: ``admin_setting`` was left out of the hand-written import
list while its table existed in the live database, so the next autogenerate would
have proposed dropping it. The test suite hit the same gap and worked around it
with a registration-only import in ``conftest.py`` instead of fixing the source.

So the list is no longer hand-written. Every module in the package is imported,
which makes "add the file" the entire registration step. Nothing imports names
from here — this module exists for the side effect alone.
"""

import pkgutil
from importlib import import_module

for _module_info in pkgutil.iter_modules(__path__):
    if _module_info.name.startswith("_"):
        continue
    import_module(f"{__name__}.{_module_info.name}")
