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


def _call_arguments(source: str, callee: str):
    """Yield the argument text of each `callee(...)` call, parens balanced."""
    for match in re.finditer(rf"\b{re.escape(callee)}\(", source):
        depth, start = 0, match.end() - 1
        for index in range(start, len(source)):
            char = source[index]
            if char == "(":
                depth += 1
            elif char == ")":
                depth -= 1
                if depth == 0:
                    yield source[start + 1 : index]
                    break


@pytest.mark.unit
class TestStockChangesOnlyThroughTheLedger:
    """`app/core/stock_ledger.py` is the only place stock may change.

    Eight call sites used to update stock directly, and each had to remember
    three things: the item total, the branch position, and a ledger row. Every
    stock bug in this codebase was a site that remembered some of them — which
    is not carelessness, because `inv.stock += qty` looks complete on its own.

    Two rules make that structural rather than remembered: nothing outside the
    ledger constructs a movement, and nothing outside it assigns stock. Both are
    checked against the source, because the failure mode is a *new* path that
    never runs an existing test.
    """

    LEDGER = "app/core/stock_ledger.py"

    def _app_sources(self):
        for path in sorted((BACKEND / "app").rglob("*.py")):
            relative = path.relative_to(BACKEND).as_posix()
            yield relative, path.read_text(encoding="utf-8", errors="replace")

    def test_movements_are_only_constructed_in_the_ledger(self):
        offenders = [
            relative
            for relative, source in self._app_sources()
            if relative != self.LEDGER
            and not relative.endswith("models/inventory.py")
            and list(_call_arguments(source, "StockMovement("[:-1]))
        ]
        assert not offenders, (
            f"{offenders} construct a StockMovement directly. Call post_movement "
            "or post_relocation — a movement row on its own records that "
            "something happened without making it happen."
        )

    def test_every_movement_the_ledger_builds_carries_a_branch(self):
        source = (BACKEND / self.LEDGER).read_text(encoding="utf-8")
        built = list(_call_arguments(source, "StockMovement"))
        assert (
            built
        ), "the ledger builds no movements — this scan is looking at the wrong file"
        missing = [a for a in built if "location_branch=" not in a]
        assert not missing, (
            f"{len(missing)} of {len(built)} movements in the ledger are built "
            "without a branch. A movement with no branch cannot be attributed "
            "to a location, which is what makes per-branch balances derivable."
        )

    def test_stock_is_only_assigned_in_the_ledger(self):
        assignment = re.compile(r"^[^#\n]*\.stock\s*(?:=(?!=)|[-+]=)", re.M)
        offenders = []
        for relative, source in self._app_sources():
            if relative == self.LEDGER or relative.startswith("app/models/"):
                continue
            for match in assignment.finditer(source):
                line = source[: match.start()].count("\n") + 1
                offenders.append(f"{relative}:{line}")
        assert not offenders, (
            f"stock is assigned outside the ledger at {offenders}. Use "
            "post_movement — assigning the total alone leaves the branch "
            "position and the ledger behind, which is every stock bug this "
            "codebase has had."
        )


@pytest.mark.unit
class TestJobStatusHasOneWriter:
    """A job's status may only change inside `_apply_status_transition`.

    A status change is never only a status change: it reserves or releases
    stock, depletes or restores on-hand, stamps compliance dates and
    recalculates the customer's balance. Five separate paths set it by hand and
    each forgot a different part of that — the PATCH handler ran no stock
    effects at all, unprint left a committed status with nothing reserved, and
    both dispatch paths skipped invoice_status and the AR recalculation.

    The pattern is not that those five were careless; it is that a bare
    assignment looks complete. This makes a sixth one fail.
    """

    ASSIGNMENT = re.compile(r"^[^#\n]*\bjob\.status\s*=(?!=)", re.M)

    def _transition_span(self, source: str) -> tuple:
        start = source.index("def _apply_status_transition")
        following = re.search(r"^def \w+", source[start + 1 :], re.M)
        return start, (start + 1 + following.start() if following else len(source))

    def test_only_the_shared_transition_assigns_job_status(self):
        offenders = []
        for path in sorted((BACKEND / "app" / "routers").rglob("*.py")):
            source = path.read_text(encoding="utf-8", errors="replace")
            if not self.ASSIGNMENT.search(source):
                continue
            span = (
                self._transition_span(source)
                if "def _apply_status_transition" in source
                else (-1, -1)
            )
            for match in self.ASSIGNMENT.finditer(source):
                if span[0] <= match.start() < span[1]:
                    continue
                line = source[: match.start()].count("\n") + 1
                offenders.append(f"{path.name}:{line}")
        assert not offenders, (
            f"job.status is assigned outside _apply_status_transition at {offenders}. "
            "Call it instead — a status change also moves stock, stamps "
            "compliance dates and recalculates the customer balance."
        )

    def test_the_shared_transition_is_where_it_says_it_is(self):
        """Guards the span logic: if the function moved, the scan above is blind."""
        source = (BACKEND / "app" / "routers" / "jobs.py").read_text(encoding="utf-8")
        start, end = self._transition_span(source)
        assert self.ASSIGNMENT.search(source[start:end]), (
            "_apply_status_transition no longer assigns job.status — the "
            "exemption above is now pointing at the wrong code."
        )
