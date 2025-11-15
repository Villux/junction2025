import json
import os
import time
from pathlib import Path

from fastapi.testclient import TestClient

os.environ["JUNCTION_API_KEY"] = "test-key"
os.environ.pop("GOOGLE_API_KEY", None)

from app.main import app


def test_health_check() -> None:
    client = TestClient(app)

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_upload_image_requires_api_key() -> None:
    client = TestClient(app)

    response = client.post("/images")

    assert response.status_code == 401


def test_upload_image_stores_file() -> None:
    client = TestClient(app)
    image_bytes = b"fake image data"

    response = client.post(
        "/images",
        headers={"X-API-Key": "test-key"},
        files=[("files", ("test.png", image_bytes, "image/png"))],
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["message"] == "images stored"
    assert len(payload["items"]) == 1

    stored_path = Path(payload["items"][0]["stored_path"])
    assert stored_path.exists()
    assert stored_path.read_bytes() == image_bytes
    assert payload["items"][0]["google_ai"]["status"] == "queued"

    result_path = stored_path.with_name(f"{stored_path.stem}_google_ai.json")

    # Background task should persist the outcome shortly after the response.
    for _ in range(10):
        if result_path.exists():
            break
        time.sleep(0.01)

    assert result_path.exists()
    result_payload = json.loads(result_path.read_text())
    assert result_payload["status"] == "skipped"

    stored_path.unlink()
    result_path.unlink()
