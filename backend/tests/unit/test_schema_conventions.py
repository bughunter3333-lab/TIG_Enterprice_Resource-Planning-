"""Conventions the schema has to keep, checked against the source itself.

Two failures this codebase has actually had, neither of which any behavioural
test could catch:

1. Columns added ahead of the code that uses them. `on_order_qty` sat unwritten
   while `list_inventory` returned raw ORM rows with no `response_model`, so it
   reached the browser as a constant zero and the stock grid rendered it as the
   "On PO" figure — a column and a filter reading a value nothing produced.

2. A second Alembic head. `c0d2e4f6a8b1_merge_heads` exists because the chain
   forked once already; a fork is silent until a deploy runs `upgrade head` and
   applies only one branch.

The dead-column scan is deliberately conservative about what counts as a write —
Pydantic field names count, because `Model(**body.model_dump())` and the setattr
loops write by that name generically. That keeps the allowlist small enough to
stay meaningful; a scan that flagged everything would just be a second list to
maintain.
"""

import json
import pathlib
import re

import pytest

BACKEND = pathlib.Path(__file__).resolve().parents[2]
MODELS = BACKEND / "app" / "models"
ALLOWLIST = pathlib.Path(__file__).parent / "unwritten_columns.json"

_DECLARATION = re.compile(r"^\s*(\w+)\s*=\s*(?:Column|mapped_column)\s*\(", re.M)
_PYDANTIC_FIELD = re.compile(
    r"^\s{4}(\w+)\s*:\s*"
    r"(?:Optional|str|int|float|bool|List|Decimal|datetime|date|dict|Any)",
    re.M,
)

# Maintained by the database, never named by application code.
_SERVER_MANAGED = {"created_at", "updated_at"}


def _write_corpus() -> str:
    sources = []
    for root in ("app/routers", "app/core", "alembic"):
        for path in (BACKEND / root).rglob("*.py"):
            sources.append(path.read_text(encoding="utf-8", errors="replace"))
    sources.append((BACKEND / "seed_data.py").read_text(encoding="utf-8"))
    return "\n".join(sources)


def _unwritten_columns() -> set[str]:
    corpus = _write_corpus()
    written_generically = set(_PYDANTIC_FIELD.findall(corpus))
    unwritten = set()
    for path in sorted(MODELS.glob("*.py")):
        if path.name == "__init__.py":
            continue
        for name in _DECLARATION.findall(
            path.read_text(encoding="utf-8", errors="replace")
        ):
            if name in _SERVER_MANAGED or name in written_generically:
                continue
            if re.search(rf"\b{re.escape(name)}\s*=[^=]", corpus):
                continue
            unwritten.add(f"{path.stem}.{name}")
    return unwritten


@pytest.mark.unit
class TestNoUnexplainedDeadColumns:
    def test_every_unwritten_column_has_a_recorded_reason(self):
        allowed = json.loads(ALLOWLIST.read_text(encoding="utf-8"))
        unexplained = sorted(_unwritten_columns() - set(allowed))
        assert not unexplained, (
            "these columns are declared but nothing writes them: "
            f"{unexplained}. Either wire them up, or add each to "
            f"{ALLOWLIST.name} with a reason. A column with no writer still "
            "reaches the client on any endpoint that returns ORM rows without a "
            "response_model, where it reads as data."
        )

    def test_the_allowlist_does_not_outlive_its_entries(self):
        """An entry that is now written should be deleted, not left to rot."""
        allowed = json.loads(ALLOWLIST.read_text(encoding="utf-8"))
        stale = sorted(set(allowed) - _unwritten_columns())
        assert (
            not stale
        ), f"{stale} now have writers — remove them from {ALLOWLIST.name}."

    def test_every_entry_states_why(self):
        allowed = json.loads(ALLOWLIST.read_text(encoding="utf-8"))
        assert allowed, "an empty allowlist means the scan broke, not that we won"
        thin = [k for k, v in allowed.items() if len(str(v).strip()) < 25]
        assert not thin, f"these entries need a real reason, not a placeholder: {thin}"


@pytest.mark.unit
class TestSingleMigrationHead:
    def test_the_migration_chain_has_exactly_one_head(self):
        versions = BACKEND / "alembic" / "versions"
        revisions, parents = set(), set()
        for path in versions.glob("*.py"):
            source = path.read_text(encoding="utf-8", errors="replace")
            found = re.search(
                r"^revision(?::\s*\w+)?\s*=\s*['\"]([^'\"]+)", source, re.M
            )
            if not found:
                continue
            revisions.add(found.group(1))
            down = re.search(r"^down_revision[^=]*=\s*(.+)$", source, re.M)
            if down:
                parents.update(re.findall(r"['\"]([^'\"]+)['\"]", down.group(1)))
        heads = sorted(revisions - parents)
        assert len(heads) == 1, (
            f"expected one migration head, found {len(heads)}: {heads}. "
            "A deploy runs `alembic upgrade head` and would apply only one "
            "branch, leaving the other's tables missing."
        )
