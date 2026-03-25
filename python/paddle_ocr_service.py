#!/usr/bin/env python3
from __future__ import annotations

import base64
import io
import json
import os
import re
import tempfile
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import unquote, urlparse

from PIL import Image, ImageOps


HOST = "127.0.0.1"
PORT = 8765

os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")

try:
    from paddleocr import PaddleOCR  # type: ignore
except Exception:  # pragma: no cover
    PaddleOCR = None


SKIPPED_REASONS = frozenset({"excluded_entry"})


def normalize_text(value: str) -> str:
    return (
        str(value or "")
        .replace("委托买人", "委托买入")
        .replace("委托卖山", "卖出")
        .replace("过期失校", "过期失效")
        .replace("克教", "克数")
        .replace("克效", "克数")
        .replace("成父价", "成交价")
        .replace("戌交价", "成交价")
        .replace("￥", "¥")
        .strip()
    )


def to_float(value: str) -> float:
    try:
        return float(str(value).replace(",", "").strip())
    except Exception:
        return 0.0


def normalize_price(value: float) -> float:
    rounded = round(value)
    if abs(value - rounded) <= 0.011:
        return float(rounded)
    return round(value, 2)


def bbox_from_points(points: list[list[float]]) -> dict[str, float]:
    xs = [point[0] for point in points]
    ys = [point[1] for point in points]
    return {"x0": min(xs), "y0": min(ys), "x1": max(xs), "y1": max(ys)}


def bbox_height(bbox: dict[str, float]) -> float:
    return max(0.0, float(bbox["y1"]) - float(bbox["y0"]))


def bbox_center_y(bbox: dict[str, float]) -> float:
    return (float(bbox["y0"]) + float(bbox["y1"])) / 2


def build_review_record(reason: str, text: str) -> dict[str, Any]:
    return {
        "reason": reason,
        "category": "skipped" if reason in SKIPPED_REASONS else "review",
        "text": text,
    }


def compute_resize_scale(width: int, height: int) -> float:
    longest_edge = max(width, height)

    if longest_edge <= 0:
        return 1.0
    if longest_edge < 1400:
        return 1.28
    if longest_edge < 1900:
        return 1.14
    if longest_edge > 3200:
        return 3200 / longest_edge
    return 1.0


def preprocess_image(image_bytes: bytes, suffix: str) -> str:
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
        temp_path = temp_file.name

    with Image.open(io.BytesIO(image_bytes)) as image:
        rgb_image = image.convert("RGB")
        width, height = rgb_image.size
        horizontal_padding = max(int(width * 0.025), 12)
        vertical_padding = max(int(height * 0.018), 16)
        padded = ImageOps.expand(
            rgb_image,
            border=(horizontal_padding, vertical_padding, horizontal_padding, vertical_padding),
            fill="white",
        )

        scale = compute_resize_scale(padded.width, padded.height)
        if abs(scale - 1.0) > 0.03:
            resampling = Image.Resampling.BICUBIC if scale > 1 else Image.Resampling.BILINEAR
            padded = padded.resize(
                (max(1, round(padded.width * scale)), max(1, round(padded.height * scale))),
                resampling,
            )

        padded.save(temp_path)

    return temp_path


@dataclass
class OcrBox:
    text: str
    confidence: float
    bbox: dict[str, float]


def extract_ocr_boxes(ocr_result: Any) -> list[OcrBox]:
    pages = ocr_result if isinstance(ocr_result, list) else [ocr_result]
    boxes: list[OcrBox] = []

    for page in pages:
        if isinstance(page, dict):
            rec_texts = page.get("rec_texts") or []
            rec_scores = page.get("rec_scores") or []
            dt_polys = page.get("dt_polys") or page.get("rec_polys") or []

            for index, raw_text in enumerate(rec_texts):
                text = normalize_text(raw_text)
                if not text:
                    continue
                points = dt_polys[index] if index < len(dt_polys) else None
                if points is None:
                    continue
                boxes.append(
                    OcrBox(
                        text=text,
                        confidence=float(rec_scores[index] if index < len(rec_scores) else 0),
                        bbox=bbox_from_points(points.tolist() if hasattr(points, "tolist") else points),
                    )
                )
            continue

        if not isinstance(page, list):
            continue
        for item in page:
            if not isinstance(item, list) or len(item) < 2:
                continue
            points, text_info = item[0], item[1]
            if not isinstance(points, list) or not isinstance(text_info, (list, tuple)) or len(text_info) < 2:
                continue
            text = normalize_text(text_info[0])
            if not text:
                continue
            boxes.append(
                OcrBox(
                    text=text,
                    confidence=float(text_info[1] or 0),
                    bbox=bbox_from_points(points),
                )
            )

    return sorted(boxes, key=lambda item: (bbox_center_y(item.bbox), item.bbox["x0"]))


def group_boxes_to_lines(boxes: list[OcrBox]) -> list[dict[str, Any]]:
    lines: list[dict[str, Any]] = []

    for box in boxes:
        center_y = bbox_center_y(box.bbox)
        current = lines[-1] if lines else None
        threshold = max(bbox_height(box.bbox) * 0.7, 10)

        if current and abs(center_y - current["center_y"]) <= threshold:
            current["boxes"].append(box)
            current["center_y"] = (current["center_y"] * (len(current["boxes"]) - 1) + center_y) / len(current["boxes"])
            continue

        lines.append({"center_y": center_y, "boxes": [box]})

    normalized_lines: list[dict[str, Any]] = []
    for line in lines:
        line_boxes = sorted(line["boxes"], key=lambda item: item.bbox["x0"])
        normalized_lines.append(
            {
                "text": " ".join(box.text for box in line_boxes),
                "bbox": {
                    "x0": min(box.bbox["x0"] for box in line_boxes),
                    "y0": min(box.bbox["y0"] for box in line_boxes),
                    "x1": max(box.bbox["x1"] for box in line_boxes),
                    "y1": max(box.bbox["y1"] for box in line_boxes),
                },
                "boxes": line_boxes,
            }
        )

    return normalized_lines


def is_direction_text(text: str) -> bool:
    return "委托买入" in text or "委托卖出" in text or re.search(r"(?<!委托)卖出", text) is not None


def is_invalid_entry(text: str) -> bool:
    return any(keyword in text for keyword in ("过期失效", "未成交", "撤单", "进行中", "活期转定期", "等克数转换"))


def is_conversion_entry_text(text: str) -> bool:
    return any(keyword in text for keyword in ("活期转定期", "等克数转换"))


def is_entry_start_text(text: str) -> bool:
    return is_direction_text(text) or is_conversion_entry_text(text)


def build_entries(lines: list[dict[str, Any]]) -> list[dict[str, Any]]:
    heights = [bbox_height(line["bbox"]) for line in lines if bbox_height(line["bbox"]) > 0]
    average_height = sum(heights) / len(heights) if heights else 24
    gap_threshold = max(average_height * 1.6, 18)
    entries: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None

    for line in lines:
        if is_entry_start_text(line["text"]):
            if current and current["lines"]:
                entries.append(current)
            current = {"lines": [line]}
            continue

        if not current:
            continue

        last_line = current["lines"][-1]
        vertical_gap = line["bbox"]["y0"] - last_line["bbox"]["y1"]
        if vertical_gap > gap_threshold:
            entries.append(current)
            current = None
            continue

        current["lines"].append(line)

    if current and current["lines"]:
        entries.append(current)

    return entries


def find_date(text: str) -> str:
    match = re.search(r"(20\d{2})[-/.年]\s*(\d{1,2})[-/.月]\s*(\d{1,2})", text)
    if not match:
        return ""
    return f"{match.group(1)}-{match.group(2).zfill(2)}-{match.group(3).zfill(2)}"


def find_weight(text: str) -> float:
    match = re.search(r"克数[:：]?\s*([\d,]+(?:\.\d+)?)", text)
    return to_float(match.group(1)) if match else 0.0


def find_deal_price(text: str) -> float:
    match = re.search(r"成交价[:：]?\s*[¥￥]?\s*([\d,]+(?:\.\d+)?)", text)
    return to_float(match.group(1)) if match else 0.0


def strip_non_amount_segments(text: str) -> str:
    return (
        text.replace("委托买入", " ")
        .replace("委托卖出", " ")
        .replace("卖出", " ")
        .replace("招商黄金账户", " ")
        .replace("交易明细", " ")
        .replace("历史交易", " ")
    )


def find_order_amount(text: str) -> float:
    cleaned = strip_non_amount_segments(text)
    cleaned = re.sub(r"成交价[:：]?\s*[¥￥]?\s*[\d,]+(?:\.\d+)?", " ", cleaned)
    cleaned = re.sub(r"委托价[:：]?\s*[¥￥]?\s*[\d,]+(?:\.\d+)?", " ", cleaned)
    cleaned = re.sub(r"克数[:：]?\s*[\d,]+(?:\.\d+)?\s*克?", " ", cleaned)
    cleaned = re.sub(r"20\d{2}[-/.年]\s*\d{1,2}[-/.月]\s*\d{1,2}", " ", cleaned)
    matches = re.findall(r"[¥￥]?\s*([\d,]+\.\d{2})", cleaned)
    amounts = [to_float(item) for item in matches if to_float(item) >= 50]
    return amounts[0] if amounts else 0.0


def reconcile_amount(weight: float, deal_price: float, amount: float) -> tuple[float, float, float]:
    if weight > 0 and deal_price > 0 and amount <= 0:
        amount = round(weight * deal_price, 2)
    elif weight > 0 and amount > 0 and deal_price <= 0:
        deal_price = normalize_price(amount / weight)
    elif deal_price > 0 and amount > 0 and weight <= 0:
        weight = round(amount / deal_price, 4)
    elif weight > 0 and deal_price > 0 and amount > 0:
        expected = round(weight * deal_price, 2)
        if abs(expected - amount) <= 0.02:
            amount = expected
            deal_price = normalize_price(amount / weight)
    return weight, deal_price, amount


def parse_entry(entry: dict[str, Any]) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    text = "\n".join(line["text"] for line in entry["lines"])
    if is_invalid_entry(text):
        return None, build_review_record("excluded_entry", text)
    if "成交价" not in text:
        return None, build_review_record("missing_deal_price", text)

    trade_action = "sell" if ("委托卖出" in text or re.search(r"(?<!委托)卖出", text)) else "buy"
    trade_action_text = "卖出" if trade_action == "sell" else "委托买入"
    trade_date = find_date(text)
    weight_g = find_weight(text)
    deal_price_cny = find_deal_price(text)
    order_amount_cny = find_order_amount(text)
    weight_g, deal_price_cny, order_amount_cny = reconcile_amount(weight_g, deal_price_cny, order_amount_cny)

    if not trade_date or weight_g <= 0 or deal_price_cny <= 0:
        return None, build_review_record("missing_required_fields", text)

    return {
        "source": "screenshot",
        "record_type": "gold_trade",
        "fields": {
            "trade_action": trade_action,
            "trade_action_text": trade_action_text,
            "order_amount_cny": round(order_amount_cny, 2),
            "trade_date": trade_date,
            "weight_g": round(weight_g, 4),
            "deal_price_cny": round(deal_price_cny, 2),
        },
    }, None


def extract_records_from_boxes(boxes: list[dict[str, Any]] | list[OcrBox]) -> dict[str, Any]:
    normalized_boxes: list[OcrBox] = []
    for box in boxes:
        if isinstance(box, OcrBox):
            normalized_boxes.append(box)
            continue
        normalized_boxes.append(
            OcrBox(
                text=normalize_text(str(box.get("text", ""))),
                confidence=float(box.get("confidence", 0) or 0),
                bbox={
                    "x0": float(box.get("bbox", {}).get("x0", 0)),
                    "y0": float(box.get("bbox", {}).get("y0", 0)),
                    "x1": float(box.get("bbox", {}).get("x1", 0)),
                    "y1": float(box.get("bbox", {}).get("y1", 0)),
                },
            )
        )

    ordered_boxes = sorted(normalized_boxes, key=lambda item: (bbox_center_y(item.bbox), item.bbox["x0"]))
    lines = group_boxes_to_lines(ordered_boxes)
    entries = build_entries(lines)

    records = []
    review_records = []
    for entry in entries:
        record, review = parse_entry(entry)
        if record:
            records.append(record)
        elif review:
            review_records.append(review)

    skipped_entries = sum(1 for review in review_records if review.get("category") == "skipped")

    return {
        "raw_text": "\n".join(box.text for box in ordered_boxes),
        "records": records,
        "review_records": review_records,
        "counts": {
            "total_entries": len(entries),
            "extracted_records": len(records),
            "skipped_entries": skipped_entries,
            "review_entries": len(review_records) - skipped_entries,
        },
        "ocr_result": {
            "boxes": [
                {
                    "text": box.text,
                    "confidence": round(box.confidence, 4),
                    "bbox": box.bbox,
                }
                for box in ordered_boxes
            ]
        },
    }


class PaddleOcrService:
    def __init__(self) -> None:
        self._engine = None

    @property
    def available(self) -> bool:
        return PaddleOCR is not None

    def get_engine(self):
        if not self.available:
            raise RuntimeError("PaddleOCR 未安装，请先安装 python/requirements-paddle.txt 中的依赖")
        if self._engine is None:
            self._engine = PaddleOCR(
                lang="ch",
                use_doc_orientation_classify=False,
                use_doc_unwarping=False,
                use_textline_orientation=False,
                text_detection_model_name="PP-OCRv5_mobile_det",
                text_recognition_model_name="PP-OCRv5_mobile_rec",
            )
        return self._engine

    def recognize(self, image_bytes: bytes, image_name: str = "") -> dict[str, Any]:
        suffix = os.path.splitext(image_name or "upload.png")[1] or ".png"

        temp_path = ""
        try:
            temp_path = preprocess_image(image_bytes, suffix)

            engine = self.get_engine()
            ocr_result = engine.predict(temp_path)
            boxes = extract_ocr_boxes(ocr_result)
            extracted = extract_records_from_boxes(boxes)

            return {
                "ok": True,
                "engine": "paddleocr-python",
                "image_id": os.path.basename(image_name or temp_path),
                **extracted,
            }
        finally:
            if temp_path and os.path.exists(temp_path):
                os.unlink(temp_path)


def decode_data_url(data_url: str) -> bytes:
    if "," not in data_url:
        raise ValueError("无效的图片数据")
    _, encoded = data_url.split(",", 1)
    return base64.b64decode(encoded)


SERVICE = PaddleOcrService()


class Handler(BaseHTTPRequestHandler):
    def end_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Image-Name")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        super().end_headers()

    def respond(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path != "/health":
            self.respond(404, {"ok": False, "error": "not_found"})
            return
        self.respond(
            200,
            {
                "ok": SERVICE.available,
                "engine": "paddleocr-python" if SERVICE.available else "",
                "message": "" if SERVICE.available else "PaddleOCR 未安装",
            },
        )

    def do_POST(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path != "/recognize":
            self.respond(404, {"ok": False, "error": "not_found"})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            raw_body = self.rfile.read(length)
            content_type = self.headers.get("Content-Type", "")

            if "application/json" in content_type:
                payload = json.loads(raw_body or "{}")
                image_name = str(payload.get("image_name", ""))
                image_bytes = decode_data_url(str(payload.get("image_data_url", "")))
            else:
                image_name = unquote(self.headers.get("X-Image-Name", "") or "")
                image_bytes = raw_body

            result = SERVICE.recognize(image_bytes, image_name)
            self.respond(200, result)
        except Exception as error:  # pragma: no cover
            self.respond(500, {"ok": False, "error": str(error)})


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Paddle OCR service listening on http://{HOST}:{PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
