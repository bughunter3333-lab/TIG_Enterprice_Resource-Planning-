"""
Pytest fixtures for TIG ERP test suite.

Architecture:
- SQLite in-memory DB (fast, no PostgreSQL required)
- Transaction-per-test rollback for full isolation
- Dependency overrides for get_db and get_current_user
- Factory fixtures for all core domain objects
"""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from starlette.testclient import TestClient

from app.database import Base, get_db
from app.main import app
from app.core.dependencies import get_current_user
from app.core.security import hash_password
from app.models.user import User
from app.models.customer import Customer
from app.models.supplier import Supplier
from app.models.inventory import InventoryItem
from app.models.purchase_order import PurchaseOrder, PurchaseOrderItem
from app.models.settings import CompanySettings

# Table registration is `import app.models` (it scans the package) — the imports
# above are only the names these fixtures actually construct.


# ---------------------------------------------------------------------------
# Database engine — session-scoped so schema is created once
# ---------------------------------------------------------------------------


@pytest.fixture(scope="session")
def test_db_engine():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)


# ---------------------------------------------------------------------------
# Per-test DB session — rolls back after every test for isolation
# ---------------------------------------------------------------------------


@pytest.fixture
def test_db_session(test_db_engine):
    connection = test_db_engine.connect()
    transaction = connection.begin()
    session = sessionmaker(autocommit=False, autoflush=False, bind=connection)()
    yield session
    session.close()
    transaction.rollback()
    connection.close()


# Short alias used in tests
@pytest.fixture
def db(test_db_session):
    return test_db_session


# ---------------------------------------------------------------------------
# Company settings — needed by several routes
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def company_settings(test_db_session):
    """Ensure company settings row exists for every test."""
    existing = test_db_session.query(CompanySettings).first()
    if not existing:
        settings = CompanySettings(
            id=1,
            company_name="Total Image (Test)",
            abn="51824753556",  # valid test ABN
            gst_rate=10.0,
            payment_terms_default="Net 30",
        )
        test_db_session.add(settings)
        test_db_session.commit()
    return existing or test_db_session.query(CompanySettings).first()


# ---------------------------------------------------------------------------
# Test admin user
# ---------------------------------------------------------------------------


@pytest.fixture
def admin_user(test_db_session):
    user = User(
        username="testadmin",
        email="admin@test.com",
        full_name="Test Admin",
        hashed_password=hash_password("password123"),
        role="admin",
        is_active=True,
    )
    test_db_session.add(user)
    test_db_session.commit()
    test_db_session.refresh(user)
    return user


@pytest.fixture
def staff_user(test_db_session):
    user = User(
        username="teststaff",
        email="staff@test.com",
        full_name="Test Staff",
        hashed_password=hash_password("password123"),
        role="staff",
        is_active=True,
    )
    test_db_session.add(user)
    test_db_session.commit()
    test_db_session.refresh(user)
    return user


# Backwards compat alias
@pytest.fixture
def test_admin_user(admin_user):
    return admin_user


@pytest.fixture
def test_regular_user(staff_user):
    return staff_user


# ---------------------------------------------------------------------------
# Test client with fully wired dependency overrides
# ---------------------------------------------------------------------------


@pytest.fixture
def client(test_db_session, admin_user):
    """
    Synchronous TestClient with:
      - get_db overridden to use the rollback-per-test session
      - get_current_user overridden to return the admin test user
    """

    def _override_db():
        try:
            yield test_db_session
        finally:
            pass

    def _override_user():
        return admin_user

    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[get_current_user] = _override_user

    with TestClient(app, raise_server_exceptions=True) as c:
        yield c

    app.dependency_overrides.clear()


@pytest.fixture
def staff_client(test_db_session, staff_user):
    """TestClient authenticated as a staff (non-admin) user."""

    def _override_db():
        try:
            yield test_db_session
        finally:
            pass

    def _override_user():
        return staff_user

    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[get_current_user] = _override_user

    with TestClient(app, raise_server_exceptions=True) as c:
        yield c

    app.dependency_overrides.clear()


@pytest.fixture
async def async_client(test_db_session, admin_user):
    """Async HTTPX client using ASGI transport — for async test functions."""
    from httpx import AsyncClient, ASGITransport

    def _override_db():
        try:
            yield test_db_session
        finally:
            pass

    def _override_user():
        return admin_user

    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[get_current_user] = _override_user

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac

    app.dependency_overrides.clear()


@pytest.fixture
def unauth_client(test_db_session):
    """TestClient with no auth override — tests 401 responses."""

    def _override_db():
        try:
            yield test_db_session
        finally:
            pass

    app.dependency_overrides[get_db] = _override_db

    with TestClient(app, raise_server_exceptions=False) as c:
        yield c

    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Domain object factories
# ---------------------------------------------------------------------------


@pytest.fixture
def make_customer(test_db_session):
    def _factory(
        id: str = "CUST001",
        name: str = "Test Customer Pty Ltd",
        abn: str = "51824753556",
        email: str = "test@customer.com",
        phone: str = "02 9000 0000",
        payment_terms: str = "Net 30",
        credit_limit: float = 5000.0,
        customer_group: str = "General",
        territory: str = "NSW",
        status: str = "Active",
        **kwargs,
    ) -> Customer:
        c = Customer(
            id=id,
            name=name,
            abn=abn,
            email=email,
            phone=phone,
            payment_terms=payment_terms,
            credit_limit=credit_limit,
            status=status,
            **kwargs,
        )
        test_db_session.add(c)
        test_db_session.commit()
        test_db_session.refresh(c)
        return c

    return _factory


@pytest.fixture
def make_supplier(test_db_session):
    def _factory(
        id: str = "SUP001",
        name: str = "Test Supplier Pty Ltd",
        abn: str = "51824753556",
        email: str = "supplier@test.com",
        phone: str = "02 9001 0000",
        payment_terms: str = "Net 30",
        currency: str = "AUD",
        status: str = "Active",
        **kwargs,
    ) -> Supplier:
        s = Supplier(
            id=id,
            name=name,
            email=email,
            phone=phone,
            payment_terms=payment_terms,
            currency=currency,
            status=status,
            **kwargs,
        )
        test_db_session.add(s)
        test_db_session.commit()
        test_db_session.refresh(s)
        return s

    return _factory


@pytest.fixture
def make_inventory(test_db_session):
    def _factory(
        sku: str = "SKU001",
        name: str = "Test Product",
        category: str = "Apparel",
        stock: int = 100,
        unit_cost: float = 10.00,
        sell_price: float = 25.00,
        min_stock: int = 10,
        status: str = "Active",
        **kwargs,
    ) -> InventoryItem:
        item = InventoryItem(
            sku=sku,
            name=name,
            category=category,
            stock=stock,
            unit_cost=unit_cost,
            sell_price=sell_price,
            min_stock=min_stock,
            status=status,
            **kwargs,
        )
        test_db_session.add(item)
        test_db_session.commit()
        test_db_session.refresh(item)
        return item

    return _factory


@pytest.fixture
def make_purchase_order(test_db_session, make_supplier):
    def _factory(
        id: str = "PO-0001",
        supplier_id: str = "SUP001",
        supplier_name: str = "Test Supplier Pty Ltd",
        status: str = "Draft",
        order_date: str = "01/07/2025",
        expected_date: str = "15/07/2025",
        gst_applicable: bool = True,
        items: list | None = None,
        **kwargs,
    ) -> PurchaseOrder:
        # Ensure supplier exists
        if not test_db_session.query(Supplier).filter_by(id=supplier_id).first():
            make_supplier(id=supplier_id, name=supplier_name)

        item_list = items or [
            {
                "sku": "SKU001",
                "description": "Test Item",
                "qty_ordered": 10,
                "unit_cost": 20.00,
                "gst_applicable": True,
            },
        ]
        total_ex = sum(i["qty_ordered"] * i["unit_cost"] for i in item_list)
        gst = round(total_ex * 0.1, 2) if gst_applicable else 0.0

        po = PurchaseOrder(
            id=id,
            supplier_id=supplier_id,
            supplier_name=supplier_name,
            status=status,
            order_date=order_date,
            expected_date=expected_date,
            total=round(total_ex + gst, 2),
            **kwargs,
        )
        for item_data in item_list:
            item_data.setdefault("qty_received", 0)
            item_data.setdefault(
                "total", item_data["qty_ordered"] * item_data["unit_cost"]
            )
            po.items.append(
                PurchaseOrderItem(
                    **{k: v for k, v in item_data.items() if k != "gst_applicable"}
                )
            )

        test_db_session.add(po)
        test_db_session.commit()
        test_db_session.refresh(po)
        return po

    return _factory
