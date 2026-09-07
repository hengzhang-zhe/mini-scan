from pathlib import Path
from uuid import uuid4

import cv2
import numpy as np
from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .scanner import scan_document

BASE_DIR = Path(__file__).resolve().parent.parent
RESULT_DIR = BASE_DIR / "data" / "results"
RESULT_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Mini Scan API", version="0.1.1")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/files", StaticFiles(directory=str(RESULT_DIR)), name="files")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/api/scan")
async def scan(
    file: UploadFile = File(...),
    mode: str = Query("color", pattern="^(color|bw)$"),
):
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(raw) > 15 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Image too large")

    image = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(status_code=400, detail="Invalid image")

    result, detected = scan_document(image, mode)
    filename = f"{uuid4().hex}.jpg"
    output_path = RESULT_DIR / filename

    ok = cv2.imwrite(
        str(output_path),
        result,
        [cv2.IMWRITE_JPEG_QUALITY, 94],
    )
    if not ok:
        raise HTTPException(status_code=500, detail="Failed to save result")

    return {
        "ok": True,
        "detected": detected,
        "mode": mode,
        "result_url": f"/files/{filename}",
    }
