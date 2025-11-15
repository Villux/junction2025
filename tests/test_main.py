import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient  # type: ignore[import-not-found]

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


def test_list_gcs_images_filters_non_images() -> None:
    client = TestClient(app)
    png_blob = MagicMock()
    png_blob.name = "generated/foo.png"
    png_blob.time_created = datetime(2024, 1, 2, 3, 4, 5, tzinfo=timezone.utc)
    txt_blob = MagicMock()
    txt_blob.name = "notes/readme.txt"

    storage_instance = MagicMock()
    storage_instance.list_blobs.return_value = [png_blob, txt_blob]

    with patch("app.main.storage.Client", return_value=storage_instance):
        response = client.get(
            "/images/gcs",
            headers={"X-API-Key": "test-key"},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["bucket"] == "eiai-images"
    assert payload["count"] == 1
    assert payload["items"] == [
        {
            "url": "https://storage.googleapis.com/eiai-images/generated/foo.png",
            "created_at": "2024-01-02T03:04:05+00:00",
        }
    ]
