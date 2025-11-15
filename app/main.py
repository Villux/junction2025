from __future__ import annotations

import asyncio
import json
import logging
import os
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import (
    BackgroundTasks,
    Depends,
    FastAPI,
    File,
    Form,
    HTTPException,
    UploadFile,
    status,
)
from fastapi.security import APIKeyHeader
from PIL import Image
from app.utils import MASTER_PROMPT

from google import genai
from google.cloud import storage

app = FastAPI(title="Junction API", version="0.1.0")
logger = logging.getLogger(__name__)

API_KEY_NAME = "X-API-Key"
EXPECTED_API_KEY = os.environ.get("JUNCTION_API_KEY")
API_KEY_HEADER = APIKeyHeader(name=API_KEY_NAME, auto_error=False)
GOOGLE_MODEL_NAME = os.environ.get("GOOGLE_AI_MODEL", "gemini-2.5-flash-image")



async def verify_api_key(api_key: str | None = Depends(API_KEY_HEADER)) -> str:
    """Validate that the client supplied the expected API key."""
    if not EXPECTED_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server API key is not configured.",
        )
    if not api_key or api_key != EXPECTED_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key.",
        )
    return api_key


@app.get("/health", tags=["health"])
async def health_check() -> dict[str, str]:
    """Return a simple response confirming the service is alive."""
    return {"status": "ok"}


@app.post("/images", tags=["images"], dependencies=[Depends(verify_api_key)])
async def upload_image(
    background_tasks: BackgroundTasks,
    files: list[UploadFile] = File(...),
    user_prompt: str | None = Form(None),
) -> dict[str, Any]:
    """
    Accept uploaded image files and persist them to /tmp with unique names.
    
    curl -X POST https://junction2025-dev-987057572708.europe-north1.run.app/images \
        -H "X-API-Key: $JUNCTION_API_KEY" \
        -F "files=@/Users/villetoiviainen/Downloads/junction_test.jpg;type=image/jpg" \
        -F "user_prompt=Tell me a short story about this image"
    """
    stored_items: list[dict[str, Any]] = []
    image_paths: list[Path] = []
    normalized_prompt = user_prompt.strip() if user_prompt and user_prompt.strip() else None

    for file in files:
        original_name = file.filename
        safe_name = Path(original_name or "uploaded").name
        destination = Path("/tmp") / f"{uuid4().hex}_{safe_name}"
        destination.parent.mkdir(parents=True, exist_ok=True)

        content = await file.read()
        destination.write_bytes(content)
        await file.close()

        image_paths.append(destination)
        stored_items.append(
            {
                "original_filename": original_name,
                "stored_path": str(destination),
                "google_ai": {"status": "queued"},
                "prompt": normalized_prompt,
            }
        )
    if image_paths:
        # background_tasks.add_task(_process_google_ai, image_paths, normalized_prompt)
        _process_google_ai(image_paths, normalized_prompt)
    return {
        "message": "images stored",
        "prompt": normalized_prompt,
        "items": stored_items,
    }


def _process_google_ai(image_paths: list[Path], user_prompt: str | None) -> None:
    """Background task that forwards the image to Google AI and persists the result."""
    if not image_paths:
        return
    api_key = os.environ.get("GEMINI_API_KEY")
    google_ai = _call_gemini(image_paths, api_key, user_prompt)
    for image_path in image_paths:
        result_path = image_path.with_name(f"{image_path.stem}_google_ai.json")
        result_path.write_text(json.dumps(google_ai, indent=2, sort_keys=True))


def _upload_to_gcs(path: Path, bucket_name: str | None) -> str | None:
    if not bucket_name:
        return None
    try:
        client = storage.Client()
        bucket = client.bucket(bucket_name)
        blob = bucket.blob(path.name)
        blob.upload_from_filename(path.as_posix())
        return f"gs://{bucket_name}/{blob.name}"
    except Exception:
        logger.exception("Failed to upload %s to bucket %s", path, bucket_name)
        return None
    

def _call_gemini(
    image_paths: list[Path], api_key: str | None, user_prompt: str | None
) -> dict[str, object]:
    """Synchronous helper that invokes Gemini and extracts useful payload."""
    if not api_key:
        return {
            "status": "skipped",
            "reason": "GOOGLE_API_KEY is not configured",
            "user_prompt": user_prompt,
        }

    client = genai.Client(api_key=api_key)  # type: ignore[call-arg]
    base_path = image_paths[0] if image_paths else None
    images: list[Image.Image] = []
    contents: list[Any] = [MASTER_PROMPT]
    if user_prompt:
        contents.append(user_prompt)
    try:
        for path in image_paths:
            image = Image.open(path)
            images.append(image)
            contents.append(image)

        response = client.models.generate_content(
            model=GOOGLE_MODEL_NAME,
            contents=contents,
        )
    finally:
        for image in images:
            image.close()

    texts: list[str] = []
    generated_paths: list[str] = []
    generated_gcs_paths: list[str] = []

    for index, part in enumerate(getattr(response, "parts", [])):
        text = getattr(part, "text", None)
        if isinstance(text, str) and text.strip():
            texts.append(text.strip())
            continue

        inline_data = getattr(part, "inline_data", None)
        if (
            base_path is not None
            and inline_data is not None
            and hasattr(part, "as_image")
        ):
            generated_image = part.as_image()
            generated_path = base_path.with_name(
                f"{base_path.stem}_gemini_{index}.png"
            )
            generated_image.save(generated_path)
            generated_paths.append(str(generated_path))
            gcs_uri = _upload_to_gcs(generated_path, "eiai-images")
            if gcs_uri:
                generated_gcs_paths.append(gcs_uri)

    payload: dict[str, object] = {
        "status": "ok",
        "model": GOOGLE_MODEL_NAME,
        "user_prompt": user_prompt,
    }

    if texts:
        payload["text"] = "\n\n".join(texts)
    if generated_paths:
        payload["generated_images"] = generated_paths
    if generated_gcs_paths:
        payload["generated_images_gcs"] = generated_gcs_paths

    return payload
