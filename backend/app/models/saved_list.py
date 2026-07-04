from sqlalchemy import Column, String, Integer, Text, DateTime, ForeignKey, func

from app.database import Base


class SavedList(Base):
    """A user's saved nav-tree list (Jim2: up to 25 per node, per user).

    filter_json is the serialized filter draft; NULL means the list was created
    but not yet run (shows empty in the tree until executed).
    """

    __tablename__ = "saved_lists"

    id = Column(String(50), primary_key=True)  # client-generated, e.g. JL-1719...
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    node = Column(String(30), nullable=False)  # jobs | quotes | stock | purchases
    name = Column(String(100), nullable=False)
    filter_json = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
