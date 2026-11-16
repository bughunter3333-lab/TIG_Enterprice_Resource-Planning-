from sqlalchemy import (
    Column,
    Integer,
    String,
    Numeric,
    Boolean,
    DateTime,
    ForeignKey,
    Text,
    func,
)
from app.database import Base


class Logo(Base):
    """A customer's logo: what it is, who sews or prints it, and its proof.

    It used to exist only as text on each job line (finding F09), so it could
    not be approved once, costed once, or reported on, and the decoration
    worklist could not tell work done in-house from work bought in (F16). Jim2
    holds it as a stock item, EMB.<LOGO>, reused and priced per application;
    here it is a record of its own, and a job line applying it points at it.
    """

    __tablename__ = "logos"

    id = Column(Integer, primary_key=True, autoincrement=True)
    # The code a job line carries, EMB.CFG.LHC — unique, compared without case.
    code = Column(String(50), nullable=False, unique=True)
    customer_id = Column(
        String(20),
        ForeignKey("customers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    name = Column(String(150))
    decoration_type = Column(String(30), nullable=False)  # EMB / TRS / Screen / DTF ...
    position = Column(String(30))  # L.Chest, Back ...
    stitch_count = Column(Integer, nullable=True)
    color_count = Column(Integer, nullable=True)
    artwork_ref = Column(String(255))
    # Per application. A job line applying the logo starts from these.
    price_ex = Column(Numeric(10, 2), default=0)
    cost_ex = Column(Numeric(10, 2), default=0)
    # in_house | subcontract. Subcontracted work names its decorator, and is
    # what the decoration worklist asks a purchase order for.
    made_by = Column(String(20), nullable=False, default="in_house")
    supplier_id = Column(
        String(20), ForeignKey("suppliers.id", ondelete="SET NULL"), nullable=True
    )
    # none | sent | approved | rejected — once, for every job that uses it (F31).
    proof_status = Column(String(20), nullable=False, default="none")
    proof_notes = Column(Text)
    proof_at = Column(DateTime(timezone=True), nullable=True)
    proof_by = Column(String(100))
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
