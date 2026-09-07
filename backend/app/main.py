from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
import cv2
import numpy as np

from .scanner import scan_document

app = FastAPI(title="Mini Scan API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/api/scan")
async def scan(
    file: UploadFile = File(...),
    mode: str = Query("color", pattern="^(color|bw)$"),
):
    raw = await file.read()
    image = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(status_code=400, detail="Invalid image")

    result, detected = scan_document(image, mode)
    ok, encoded = cv2.imencode(".jpg", result, [cv2.IMWRITE_JPEG_QUALITY, 94])
    if not ok:
        raise HTTPException(status_code=500, detail="Failed to encode result")

    return Response(
        content=encoded.tobytes(),
        media_type="image/jpeg",
        headers={"X-Document-Detected": "true" if detected else "false"},
    )
