import pytest


@pytest.mark.integration
def test_admin_settings_put_and_get(client):
    # PUT a setting
    res = client.put(
        "/admin/settings/field_config", json={"value": '{"price_level": true}'}
    )
    assert res.status_code == 200
    assert res.json()["key"] == "field_config"

    # GET it back
    get_res = client.get("/admin/settings/field_config")
    assert get_res.status_code == 200
    assert get_res.json()["value"] == '{"price_level": true}'


@pytest.mark.integration
def test_admin_settings_missing_key_returns_null(client):
    res = client.get("/admin/settings/nonexistent_key")
    assert res.status_code == 200
    assert res.json()["value"] is None
