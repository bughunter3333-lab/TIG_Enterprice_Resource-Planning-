"""Vercel's entry point for the API.

Vercel runs each file under `api/` as a serverless function and looks for an
ASGI `app` in it. `vercel.json` rewrites every path to this one function, and
the original path survives the rewrite, so FastAPI routes the request exactly
as uvicorn would locally: `/auth/login` still reaches `routers/auth.py`.
"""

import os
import sys

# The function runs from `api/`; `app` is a package one level up.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.main import app  # noqa: E402,F401
