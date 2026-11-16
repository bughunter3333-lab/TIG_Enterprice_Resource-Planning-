"""Migrate the database while Vercel builds a production deployment.

On Render the start command ran `alembic upgrade head` before the server came
up. Vercel has no start command, so the build does it (backend/vercel.json,
`buildCommand`): the build runs before the new deployment takes any traffic,
and a failed migration fails the build, so production stays on the deployment
it had. Preview and local builds never touch the database.
"""

import os
import subprocess
import sys
from typing import Mapping


def main(environ: Mapping[str, str] = os.environ) -> int:
    where = environ.get("VERCEL_ENV")
    if environ.get("VERCEL") and not where:
        # Vercel withholds VERCEL_ENV when the project's "Automatically expose
        # System Environment Variables" is off. Skipping then would put new
        # code live on a schema that was never migrated.
        print(
            "On Vercel, but VERCEL_ENV is not set: turn on Settings → Environment "
            "Variables → Automatically expose System Environment Variables. "
            "Refusing to deploy without knowing whether to migrate.",
            file=sys.stderr,
        )
        return 1
    if where != "production":
        print(f"Not a production build ({where or 'not on Vercel'}): no migrations.")
        return 0
    if not (environ.get("MIGRATION_DATABASE_URL") or environ.get("DATABASE_URL")):
        print(
            "A production build with no database to migrate: set DATABASE_URL "
            "(and MIGRATION_DATABASE_URL) on the project. Refusing to deploy.",
            file=sys.stderr,
        )
        return 1
    return subprocess.call([sys.executable, "-m", "alembic", "upgrade", "head"])


if __name__ == "__main__":
    sys.exit(main())
