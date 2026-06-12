import pytest
from sqlalchemy.orm import Session

from app.models.customer import Customer


@pytest.mark.unit
def test_customer_creation(test_db_session: Session):
    """Test basic customer creation."""
    customer = Customer(
        id="CUST001",
        name="Test Customer Inc",
        email="customer@example.com",
        phone="555-1234",
        address="123 Main St, City, State 12345",
        abn="12345678900",
        account_type="Account",
        payment_terms="Net 30",
        credit_limit=10000.00,
        status="Active",
    )
    test_db_session.add(customer)
    test_db_session.commit()
    test_db_session.refresh(customer)

    assert customer.id == "CUST001"
    assert customer.name == "Test Customer Inc"
    assert customer.email == "customer@example.com"
    assert customer.balance == 0  # Default
    assert customer.status == "Active"


@pytest.mark.unit
def test_customer_defaults(test_db_session: Session):
    """Test customer model defaults."""
    customer = Customer(
        id="CUST002",
        name="Minimal Customer",
    )
    test_db_session.add(customer)
    test_db_session.commit()
    test_db_session.refresh(customer)

    assert customer.account_type == "Account"
    assert customer.payment_terms == "Net 30"
    assert customer.credit_limit == 0
    assert customer.balance == 0
    assert customer.ytd_sales == 0


@pytest.mark.unit
def test_customer_status_filter(test_db_session: Session):
    """Test querying customers by status."""
    # Create active and inactive customers
    active = Customer(id="CUST003", name="Active Customer", status="Active")
    inactive = Customer(id="CUST004", name="Inactive Customer", status="Inactive")

    test_db_session.add_all([active, inactive])
    test_db_session.commit()

    # Query active customers
    active_customers = (
        test_db_session.query(Customer).filter(Customer.status == "Active").all()
    )
    assert len(active_customers) == 1
    assert active_customers[0].id == "CUST003"

    # Query inactive customers
    inactive_customers = (
        test_db_session.query(Customer).filter(Customer.status == "Inactive").all()
    )
    assert len(inactive_customers) == 1
    assert inactive_customers[0].id == "CUST004"


@pytest.mark.unit
def test_customer_search(test_db_session: Session):
    """Test searching customers by name."""
    customer1 = Customer(id="CUST005", name="ABC Corporation")
    customer2 = Customer(id="CUST006", name="XYZ Industries")
    customer3 = Customer(id="CUST007", name="ABC Services")

    test_db_session.add_all([customer1, customer2, customer3])
    test_db_session.commit()

    # Search for "ABC"
    results = test_db_session.query(Customer).filter(Customer.name.ilike("%ABC%")).all()
    assert len(results) == 2
    assert all("ABC" in c.name for c in results)
