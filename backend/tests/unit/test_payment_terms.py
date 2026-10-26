"""When an invoice falls due, read from the customer's payment terms.

Terms are typed by people, so each form in use is held here in every spelling
it turns up in, and anything else falls back to the company's default terms
and then to Net 30 — never to no due date at all.
"""

from datetime import date

import pytest

from app.core.payment_terms import DEFAULT_TERMS, due_date

INVOICED = date(2026, 1, 15)


@pytest.mark.unit
class TestTheFormsInUse:
    @pytest.mark.parametrize(
        "terms",
        [
            "Net 14",
            "net 14",
            "NET 14",
            "Net14",
            "  Net   14 ",
            "Net 14 days",
            "Net 14 Day",
        ],
    )
    def test_net_n_is_n_days_after_the_invoice(self, terms):
        assert due_date(INVOICED, terms) == date(2026, 1, 29)

    @pytest.mark.parametrize("terms", ["14 days", "14 Days", "14days", "14 day"])
    def test_n_days_is_the_same(self, terms):
        assert due_date(INVOICED, terms) == date(2026, 1, 29)

    # Jim2's own terms codes, as printed on a TIG job sheet ("Pay Terms
    # 30DAYSINV"), and the words the code abbreviates.
    @pytest.mark.parametrize(
        "terms",
        [
            "14DAYSINV",
            "14daysinv",
            "14 DAYS INV",
            "14 days invoice",
            "14 days from invoice",
        ],
    )
    def test_n_days_inv_is_n_days_after_the_invoice(self, terms):
        assert due_date(INVOICED, terms) == date(2026, 1, 29)

    @pytest.mark.parametrize(
        "terms",
        ["COD", "cod", "Cash", "CASH", "Prepaid", "Due on receipt", "due  on RECEIPT"],
    )
    def test_cash_on_delivery_and_its_kin_are_due_the_day_of_the_invoice(self, terms):
        assert due_date(INVOICED, terms) == INVOICED

    @pytest.mark.parametrize("terms", ["EOM", "eom", " Eom "])
    def test_eom_is_the_last_day_of_the_invoices_month(self, terms):
        assert due_date(INVOICED, terms) == date(2026, 1, 31)

    @pytest.mark.parametrize("terms", ["30 EOM", "Net 30 EOM", "net30eom", "30eom"])
    def test_n_eom_is_n_days_after_the_end_of_that_month(self, terms):
        assert due_date(INVOICED, terms) == date(2026, 3, 2)

    def test_month_ends_and_year_ends_are_counted_as_the_calendar_has_them(self):
        assert due_date(date(2028, 2, 10), "EOM") == date(2028, 2, 29)
        assert due_date(date(2026, 2, 10), "EOM") == date(2026, 2, 28)
        assert due_date(date(2026, 12, 15), "Net 30") == date(2027, 1, 14)
        assert due_date(date(2026, 12, 31), "EOM") == date(2026, 12, 31)

    def test_net_0_is_the_day_itself(self):
        assert due_date(INVOICED, "Net 0") == INVOICED


@pytest.mark.unit
class TestWhatCannotBeRead:
    UNREADABLE = [
        None,
        "",
        "   ",
        "Net",
        "Net -5",
        "Net 30x",
        "Net 1000",
        "30",
        "EOM 30",
        "fortnightly",
        "Net 30 EOM please",
    ]

    @pytest.mark.parametrize("terms", UNREADABLE)
    def test_falls_back_to_the_company_default(self, terms):
        assert due_date(INVOICED, terms, "Net 7") == date(2026, 1, 22)

    @pytest.mark.parametrize("terms", UNREADABLE)
    def test_and_with_no_default_to_net_30(self, terms):
        assert DEFAULT_TERMS == "Net 30"
        assert due_date(INVOICED, terms) == date(2026, 2, 14)
        assert due_date(INVOICED, terms, None) == date(2026, 2, 14)

    def test_a_default_that_cannot_be_read_either_is_net_30(self):
        assert due_date(INVOICED, None, "whenever") == date(2026, 2, 14)
        assert due_date(INVOICED, "", "") == date(2026, 2, 14)

    def test_the_customers_own_terms_come_before_the_default(self):
        assert due_date(INVOICED, "COD", "Net 60") == INVOICED
