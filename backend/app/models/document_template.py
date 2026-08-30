from sqlalchemy import Column, DateTime, String, Text, func

from app.database import Base


class DocumentTemplate(Base):
    """The layout of one printed document, as designed in the app.

    One row per document type — job sheet, delivery note, consignment note,
    picking list, ship label — because these are the company's stationery
    rather than a per-user preference. Whoever prints a delivery note prints
    the same one.

    `spec` is the template JSON: bands, blocks and their settings. It is stored
    opaquely on purpose. The shape belongs to the renderer that reads it, and
    modelling it in columns here would mean a migration every time a block gains
    an option. Absence of a row is meaningful: it means the built-in default is
    still in use.
    """

    __tablename__ = "document_templates"

    doc_type = Column(String(40), primary_key=True)
    name = Column(String(100), nullable=False)
    spec = Column(Text, nullable=False)
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
