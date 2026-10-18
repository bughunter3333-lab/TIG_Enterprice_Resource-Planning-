"""The one reading of a bin code, shared by put-away and rack sections.

Put-away pins the spelling through HTTP (`test_bin_map.py`); this pins the
parts, which is what a section is built from — a section compares bays and
boxes as numbers and levels as letters, so the parse has to hand them back as
exactly that.
"""

import pytest

from app.core.bin_codes import box_code, parse_box_code


@pytest.mark.unit
class TestParseBoxCode:
    def test_a_code_is_read_into_its_four_parts(self):
        assert parse_box_code("B.3.H.1") == ("B", 3, "H", 1)

    def test_case_padding_and_surrounding_space_do_not_make_a_different_box(self):
        assert parse_box_code(" b.03.h.01 ") == ("B", 3, "H", 1)
        assert box_code(" b.03.h.01 ") == "B.3.H.1"

    def test_runs_of_letters_and_digits_are_kept_whole(self):
        assert parse_box_code("aa.12.ab.30") == ("AA", 12, "AB", 30)
        assert box_code("aa.12.ab.30") == "AA.12.AB.30"

    @pytest.mark.parametrize(
        "text",
        [
            None,
            "",
            "   ",
            "A-01-04",  # the legacy shelf spelling
            "B.3.H",  # no box
            "B.3.H.1.2",  # one part too many
            "B..H.1",
            "3.B.1.H",  # numbers where the letters go
            "B.0.H.1",  # bays are numbered from 1
            "B.3.H.0",  # boxes are numbered from 1
            "B.-3.H.1",
            "B.\uff13.H.1",  # a full-width 3: a digit the map cannot read
            "\u00df.1.a.1",  # upper-cases to SS
            "\ufb03.1.a.1",  # one letter that upper-cases to three
        ],
    )
    def test_anything_else_is_not_a_box_code(self, text):
        assert parse_box_code(text) is None
        assert box_code(text) is None
