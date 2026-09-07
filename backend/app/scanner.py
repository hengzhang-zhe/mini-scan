import cv2
import numpy as np


def _order_points(points: np.ndarray) -> np.ndarray:
    pts = points.reshape(4, 2).astype(np.float32)
    ordered = np.zeros((4, 2), dtype=np.float32)
    sums = pts.sum(axis=1)
    diffs = np.diff(pts, axis=1).reshape(-1)
    ordered[0] = pts[np.argmin(sums)]      # top-left
    ordered[2] = pts[np.argmax(sums)]      # bottom-right
    ordered[1] = pts[np.argmin(diffs)]     # top-right
    ordered[3] = pts[np.argmax(diffs)]     # bottom-left
    return ordered


def _find_document(image: np.ndarray) -> np.ndarray | None:
    h, w = image.shape[:2]
    scale = min(1.0, 1200.0 / max(h, w))
    small = cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)

    gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(gray, 50, 150)
    edges = cv2.dilate(edges, np.ones((3, 3), np.uint8), iterations=1)

    contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    contours = sorted(contours, key=cv2.contourArea, reverse=True)[:20]
    image_area = small.shape[0] * small.shape[1]

    for contour in contours:
        if cv2.contourArea(contour) < image_area * 0.15:
            continue
        perimeter = cv2.arcLength(contour, True)
        polygon = cv2.approxPolyDP(contour, 0.02 * perimeter, True)
        if len(polygon) == 4 and cv2.isContourConvex(polygon):
            return polygon.reshape(4, 2).astype(np.float32) / scale
    return None


def _warp(image: np.ndarray, points: np.ndarray) -> np.ndarray:
    tl, tr, br, bl = _order_points(points)
    width = int(max(np.linalg.norm(br - bl), np.linalg.norm(tr - tl)))
    height = int(max(np.linalg.norm(tr - br), np.linalg.norm(tl - bl)))
    width = max(width, 1)
    height = max(height, 1)

    destination = np.array(
        [[0, 0], [width - 1, 0], [width - 1, height - 1], [0, height - 1]],
        dtype=np.float32,
    )
    matrix = cv2.getPerspectiveTransform(np.array([tl, tr, br, bl]), destination)
    return cv2.warpPerspective(image, matrix, (width, height))


def _enhance_color(image: np.ndarray) -> np.ndarray:
    lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    l = clahe.apply(l)
    return cv2.cvtColor(cv2.merge((l, a, b)), cv2.COLOR_LAB2BGR)


def _enhance_bw(image: np.ndarray) -> np.ndarray:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (3, 3), 0)
    return cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 15
    )


def scan_document(image: np.ndarray, mode: str = "color") -> tuple[np.ndarray, bool]:
    corners = _find_document(image)
    detected = corners is not None
    scanned = _warp(image, corners) if detected else image.copy()

    if mode == "bw":
        scanned = _enhance_bw(scanned)
    else:
        scanned = _enhance_color(scanned)

    return scanned, detected
