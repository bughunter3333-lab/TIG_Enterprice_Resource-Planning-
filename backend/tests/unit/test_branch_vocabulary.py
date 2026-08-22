"""The frontend and backend must offer the same branches.

Branch keys every stock position — `stock_locations` is one row per
(sku, branch). The two lists disagreeing does not raise; it opens a position
under a name nothing else uses, and the stock at the branch people meant is
never touched. That is why the list is pinned rather than trusted.
"""

import pathlib
import re

import pytest

from app.core.branches import BRANCHES, DEFAULT_BRANCH, normalize_branch

FRONTEND_BRANCHES = (
    pathlib.Path(__file__).resolve().parents[3] / "frontend" / "src" / "branches.js"
)


@pytest.mark.unit
class TestBranchVocabulary:
    def test_the_frontend_list_matches_the_backend_one(self):
        source = FRONTEND_BRANCHES.read_text(encoding="utf-8")
        declared = re.search(r"export const BRANCHES = \[([^\]]*)\]", source)
        assert declared, f"no BRANCHES array in {FRONTEND_BRANCHES.name}"
        names = tuple(re.findall(r"'([^']+)'", declared.group(1)))
        assert names == BRANCHES, (
            "the branch lists have drifted. A branch the frontend offers but the "
            "backend does not know still creates a stock position — under a name "
            "nothing else reads."
        )

    def test_the_default_is_the_first_entry_on_both_sides(self):
        source = FRONTEND_BRANCHES.read_text(encoding="utf-8")
        assert "export const DEFAULT_BRANCH = BRANCHES[0]" in source
        assert DEFAULT_BRANCH == BRANCHES[0]

    def test_casing_and_whitespace_are_tidied(self):
        assert normalize_branch(" hq ") == "HQ"
        assert normalize_branch("melbourne") == "Melbourne"

    def test_an_unknown_branch_is_left_alone(self):
        """Aliasing an old spelling onto a current label would point every
        lookup at a different row and hide the stock at the real one."""
        assert normalize_branch("MELB") == "MELB"
        assert normalize_branch("Container 4") == "Container 4"

    def test_no_branch_means_the_default(self):
        assert normalize_branch(None) == DEFAULT_BRANCH
        assert normalize_branch("") == DEFAULT_BRANCH
