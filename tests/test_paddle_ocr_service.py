import json
import pathlib
import unittest

from python.paddle_ocr_service import extract_records_from_boxes


FIXTURE_PATH = pathlib.Path(__file__).parent / "fixtures" / "cmb-history-ocr-boxes.json"


class PaddleOcrServiceTest(unittest.TestCase):
    def test_extract_records_from_boxes(self) -> None:
        boxes = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
        result = extract_records_from_boxes(boxes)

        self.assertEqual(len(result["records"]), 1)
        self.assertEqual(result["records"][0], {
            "source": "screenshot",
            "record_type": "gold_trade",
            "fields": {
                "trade_action": "buy",
                "trade_action_text": "委托买入",
                "order_amount_cny": 999.04,
                "trade_date": "2025-10-28",
                "weight_g": 1.12,
                "deal_price_cny": 892.0,
            },
        })
        self.assertEqual(len(result["review_records"]), 1)
        self.assertEqual(result["review_records"][0]["reason"], "excluded_entry")
        self.assertEqual(result["review_records"][0]["category"], "skipped")
        self.assertEqual(result["counts"], {
            "total_entries": 2,
            "extracted_records": 1,
            "skipped_entries": 1,
            "review_entries": 0,
        })

    def test_valid_trade_before_conversion_block_is_not_dropped(self) -> None:
        boxes = [
            {"text": "委托买入", "confidence": 0.99, "bbox": {"x0": 10, "y0": 100, "x1": 90, "y1": 124}},
            {"text": "¥10500.00", "confidence": 0.98, "bbox": {"x0": 160, "y0": 100, "x1": 280, "y1": 124}},
            {"text": "成交价:¥1050.00", "confidence": 0.97, "bbox": {"x0": 520, "y0": 100, "x1": 700, "y1": 124}},
            {"text": "2025-03-19", "confidence": 0.99, "bbox": {"x0": 10, "y0": 136, "x1": 120, "y1": 160}},
            {"text": "克数:10.0000克", "confidence": 0.98, "bbox": {"x0": 160, "y0": 136, "x1": 320, "y1": 160}},
            {"text": "活期转定期", "confidence": 0.97, "bbox": {"x0": 10, "y0": 214, "x1": 130, "y1": 238}},
            {"text": "等克数转换", "confidence": 0.97, "bbox": {"x0": 160, "y0": 214, "x1": 280, "y1": 238}},
            {"text": "2025-03-19", "confidence": 0.99, "bbox": {"x0": 10, "y0": 250, "x1": 120, "y1": 274}},
            {"text": "克数:30.0000克", "confidence": 0.98, "bbox": {"x0": 160, "y0": 250, "x1": 320, "y1": 274}},
            {"text": "委托买入", "confidence": 0.99, "bbox": {"x0": 10, "y0": 330, "x1": 90, "y1": 354}},
            {"text": "¥7385.00", "confidence": 0.98, "bbox": {"x0": 160, "y0": 330, "x1": 260, "y1": 354}},
            {"text": "成交价:¥1055.00", "confidence": 0.97, "bbox": {"x0": 520, "y0": 330, "x1": 700, "y1": 354}},
            {"text": "2025-03-19", "confidence": 0.99, "bbox": {"x0": 10, "y0": 366, "x1": 120, "y1": 390}},
            {"text": "克数:7.0000克", "confidence": 0.98, "bbox": {"x0": 160, "y0": 366, "x1": 300, "y1": 390}},
        ]

        result = extract_records_from_boxes(boxes)

        self.assertEqual(len(result["records"]), 2)
        self.assertEqual(result["records"][0]["fields"]["deal_price_cny"], 1050.0)
        self.assertEqual(result["records"][1]["fields"]["deal_price_cny"], 1055.0)
        self.assertEqual(len(result["review_records"]), 1)
        self.assertEqual(result["review_records"][0]["reason"], "excluded_entry")
        self.assertEqual(result["review_records"][0]["category"], "skipped")
        self.assertEqual(result["counts"], {
            "total_entries": 3,
            "extracted_records": 2,
            "skipped_entries": 1,
            "review_entries": 0,
        })

    def test_header_filters_are_not_counted_as_skipped_entries(self) -> None:
        boxes = [
            {"text": "进行中", "confidence": 0.99, "bbox": {"x0": 10, "y0": 20, "x1": 90, "y1": 42}},
            {"text": "历史交易", "confidence": 0.99, "bbox": {"x0": 120, "y0": 20, "x1": 220, "y1": 42}},
            {"text": "最近1个月", "confidence": 0.98, "bbox": {"x0": 10, "y0": 60, "x1": 120, "y1": 82}},
            {"text": "全部", "confidence": 0.98, "bbox": {"x0": 180, "y0": 60, "x1": 230, "y1": 82}},
            {"text": "尾号9421", "confidence": 0.98, "bbox": {"x0": 300, "y0": 60, "x1": 390, "y1": 82}},
            {"text": "委托买入", "confidence": 0.99, "bbox": {"x0": 10, "y0": 120, "x1": 90, "y1": 144}},
            {"text": "¥12120.00", "confidence": 0.98, "bbox": {"x0": 180, "y0": 120, "x1": 300, "y1": 144}},
            {"text": "成交价:¥1010.00", "confidence": 0.97, "bbox": {"x0": 460, "y0": 120, "x1": 640, "y1": 144}},
            {"text": "2026-03-19", "confidence": 0.99, "bbox": {"x0": 10, "y0": 154, "x1": 120, "y1": 178}},
            {"text": "克数:12.0000克", "confidence": 0.98, "bbox": {"x0": 180, "y0": 154, "x1": 340, "y1": 178}},
            {"text": "委托买入 已撤单", "confidence": 0.99, "bbox": {"x0": 10, "y0": 220, "x1": 150, "y1": 244}},
            {"text": "2026-03-19", "confidence": 0.99, "bbox": {"x0": 10, "y0": 254, "x1": 120, "y1": 278}},
            {"text": "克数:15.0000克", "confidence": 0.98, "bbox": {"x0": 180, "y0": 254, "x1": 340, "y1": 278}},
            {"text": "委托价:¥1000.00", "confidence": 0.97, "bbox": {"x0": 460, "y0": 254, "x1": 640, "y1": 278}},
        ]

        result = extract_records_from_boxes(boxes)

        self.assertEqual(len(result["records"]), 1)
        self.assertEqual(len(result["review_records"]), 1)
        self.assertEqual(result["review_records"][0]["reason"], "excluded_entry")
        self.assertEqual(result["counts"], {
            "total_entries": 2,
            "extracted_records": 1,
            "skipped_entries": 1,
            "review_entries": 0,
        })


if __name__ == "__main__":
    unittest.main()
