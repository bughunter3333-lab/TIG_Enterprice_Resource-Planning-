"""The ship label carries what TIG's Jim2 label carries (JIM28).

Jim2's label reads Ship Code, Attn, the site address, From, Sender Ref# (the
job's Cust Ref), Job #, Ship Via, the connote and n of N. Ours lacked the Ship
Code, the Attn and the Ship Via, so a satchel for one of a customer's 68 sites
said which customer but not which site, or for whom.
"""

import pytest
from reportlab.platypus import Paragraph

from app.core import despatch_documents
from app.models.job import Job
from app.models.settings import CompanySettings

pytestmark = pytest.mark.integration


def _label_text(job, despatch=None) -> str:
    company = CompanySettings(company_name="Total Image", address="Marrickville NSW")
    story = despatch_documents.ship_labels(job, company, despatch or {})
    return "\n".join(p.text for p in story if isinstance(p, Paragraph))


def _job(**fields):
    base = dict(
        id="SL-1",
        customer_id="ARCARE",
        customer_name="Arcare Aged Care",
        ship_to="AR.KNO",
        shipping_address="Arcare Knox, Wantirna South VIC 3152",
        name_contact="Care manager",
        cust_ref="ARC-HO-2291",
        ship_via="StarTrack",
        connote="ST-50232",
    )
    return Job(**{**base, **fields})


def test_it_names_the_site_by_its_ship_code():
    assert "Ship Code <b>AR.KNO</b>" in _label_text(_job())


def test_it_is_for_the_attention_of_the_jobs_contact():
    assert "Attn Care manager" in _label_text(_job())


def test_it_says_how_it_goes():
    assert "Ship Via <b>StarTrack</b>" in _label_text(_job())


def test_the_consignment_being_sent_wins_over_the_jobs_last():
    text = _label_text(_job(), {"ship_via": "Toll", "ship_ref": "TL-1", "cartons": 2})
    assert "Ship Via <b>Toll</b>" in text
    assert "Connote TL-1" in text
    assert text.count("Ship Code <b>AR.KNO</b>") == 2  # on every carton


def test_the_senders_reference_is_the_jobs_cust_ref():
    assert "Sender Ref ARC-HO-2291" in _label_text(_job())


def test_a_job_without_a_site_contact_or_carrier_leaves_the_lines_off():
    text = _label_text(_job(ship_to=None, name_contact=None, ship_via=None))
    assert "Ship Code" not in text
    assert "Attn" not in text
    assert "Ship Via" not in text


def test_a_site_code_is_text_not_markup():
    assert "Ship Code <b>A&amp;B &lt;1&gt;</b>" in _label_text(_job(ship_to="A&B <1>"))
