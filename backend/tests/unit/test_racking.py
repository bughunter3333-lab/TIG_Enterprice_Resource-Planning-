"""The racking a branch has, as the server reads it.

The 3D warehouse map validates a stored layout before drawing it and falls back
to the default racking when it does not pass. The server has to read the same
setting to the same answer, or a bin the screen calls valid is refused on save
(or the other way round). These pin the two together.
"""

import json
import pathlib
import re

import pytest

from app.core.racking import DEFAULT_LAYOUT, box_problem, read_layout

SHARED_CASES = (
    pathlib.Path(__file__).resolve().parents[3]
    / "frontend"
    / "src"
    / "modules"
    / "warehouse"
    / "__tests__"
    / "layoutCases.json"
)
CASES = json.loads(SHARED_CASES.read_text(encoding="utf-8"))["cases"]

FRONTEND_LAYOUT = (
    pathlib.Path(__file__).resolve().parents[3]
    / "frontend"
    / "src"
    / "modules"
    / "warehouse"
    / "layout.js"
)

GOOD = {
    "version": 1,
    "aisles": ["a", "B "],
    "baysPerAisle": 4,
    "beams": [2, 3],
    "excessShelf": False,
    "positions": 3,
    "oddSide": "left",
}


def _stored(**changes) -> str:
    return json.dumps({**GOOD, **changes})


@pytest.mark.unit
class TestTheDefaultRacking:
    def test_it_is_the_one_the_map_draws(self):
        source = FRONTEND_LAYOUT.read_text(encoding="utf-8")
        block = re.search(r"export const DEFAULT_LAYOUT = \{(.*?)\n\};", source, re.S)
        assert block, "no DEFAULT_LAYOUT in layout.js"
        text = block.group(1)

        def number(name):
            return int(re.search(rf"{name}:\s*(\d+)", text).group(1))

        def items(name):
            return re.search(rf"{name}:\s*\[([^\]]*)\]", text).group(1)

        assert re.findall(r"'([^']+)'", items("aisles")) == DEFAULT_LAYOUT["aisles"]
        assert [int(n) for n in re.findall(r"\d+", items("beams"))] == (
            DEFAULT_LAYOUT["beams"]
        )
        assert number("baysPerAisle") == DEFAULT_LAYOUT["baysPerAisle"]
        assert number("positions") == DEFAULT_LAYOUT["positions"]
        assert ("excessShelf: true" in text) is DEFAULT_LAYOUT["excessShelf"]
        assert f"oddSide: '{DEFAULT_LAYOUT['oddSide']}'" in text

    def test_nothing_stored_is_the_default(self):
        assert read_layout(None) == DEFAULT_LAYOUT
        assert read_layout("") == DEFAULT_LAYOUT


@pytest.mark.unit
class TestAStoredLayout:
    def test_a_sound_one_is_used_with_its_aisles_tidied(self):
        layout = read_layout(_stored())
        assert layout["aisles"] == ["A", "B"]
        assert layout["baysPerAisle"] == 4
        assert layout["beams"] == [2, 3]
        assert layout["positions"] == 3

    def test_a_whole_number_written_with_a_decimal_point_is_still_whole(self):
        assert read_layout(_stored(baysPerAisle=4.0))["baysPerAisle"] == 4

    @pytest.mark.parametrize(
        "broken",
        [
            "not json",
            "[]",
            "null",
            "7",
            _stored(aisles=[]),
            _stored(aisles=["A", "a"]),
            _stored(aisles=["A1"]),
            _stored(aisles="AB"),
            _stored(aisles=[chr(65 + i) for i in range(26)] + ["AA"]),
            _stored(baysPerAisle=0),
            _stored(baysPerAisle=61),
            _stored(baysPerAisle=2.5),
            _stored(baysPerAisle="4"),
            _stored(baysPerAisle=True),
            _stored(beams=[]),
            _stored(beams=[0]),
            _stored(beams=[20, 7]),
            _stored(beams="3"),
            _stored(positions=0),
            _stored(positions=21),
            _stored(excessShelf="yes"),
            _stored(oddSide="middle"),
        ],
    )
    def test_one_the_map_would_not_draw_is_not_used(self, broken):
        assert read_layout(broken) == DEFAULT_LAYOUT


@pytest.mark.unit
class TestWhetherABoxIsInTheRacking:
    def test_every_corner_of_the_default_racking_is(self):
        for box in (("E", 1, "A", 1), ("A", 10, "L", 6), ("C", 5, "F", 3)):
            assert box_problem(DEFAULT_LAYOUT, box) is None

    def test_what_is_wrong_is_named_with_what_there_is(self):
        said = box_problem(DEFAULT_LAYOUT, ("Q", 1, "A", 1))
        assert said == "there is no aisle Q (aisles E, D, C, B, A)"
        said = box_problem(DEFAULT_LAYOUT, ("B", 11, "A", 1))
        assert said == "there is no bay 11 (bays 1 to 10)"
        said = box_problem(DEFAULT_LAYOUT, ("B", 1, "M", 1))
        assert said == "there is no level M (levels A to L)"
        said = box_problem(DEFAULT_LAYOUT, ("B", 1, "AA", 1))
        assert said == "there is no level AA (levels A to L)"
        said = box_problem(DEFAULT_LAYOUT, ("B", 1, "A", 7))
        assert said == "there is no box 7 on a level (boxes 1 to 6)"

    def test_a_smaller_racking_has_fewer_boxes(self):
        small = read_layout(_stored())
        assert box_problem(small, ("B", 4, "E", 3)) is None
        assert box_problem(small, ("C", 1, "A", 1)) is not None
        assert box_problem(small, ("B", 5, "A", 1)) is not None
        assert box_problem(small, ("B", 1, "F", 1)) is not None
        assert box_problem(small, ("B", 1, "A", 4)) is not None


@pytest.mark.unit
class TestTheMapAndTheServerReadEveryLayoutAlike:
    """One list of stored layouts, run by this test and by the map's own
    (frontend layout.test.js). A layout one side accepted and the other did not
    would be a bin the screen calls real and the server refuses."""

    @pytest.mark.parametrize("case", CASES, ids=[c["why"] for c in CASES])
    def test_a_stored_layout(self, case):
        read = read_layout(case["raw"])
        if case["reads"] == "default":
            assert read == DEFAULT_LAYOUT
        else:
            assert read == case["reads"]

    def test_the_list_has_both_kinds(self):
        kinds = {isinstance(c["reads"], dict) for c in CASES}
        assert kinds == {True, False}

    def test_nesting_too_deep_to_read_is_the_default_not_an_error(self):
        assert read_layout("[" * 100_000 + "]" * 100_000) == DEFAULT_LAYOUT
