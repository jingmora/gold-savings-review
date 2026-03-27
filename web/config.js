export const STORAGE_KEY = "gold-savings-review-state";
export const DB_NAME = "gold-savings-review-db";
export const DB_VERSION = 1;
export const BATCH_STORE = "batches";
export const LOCAL_OCR_SERVICE_URL = "http://127.0.0.1:8765";
export const LOCAL_OCR_SERVICE_TIMEOUT_MS = 20000;

export const STATUS_LABELS = {
  queued: "待识别",
  processing: "识别中",
  done: "完成",
  error: "复查",
};

export const DIRECTION_LABELS = {
  buy: "委托买入",
  sell: "委托卖出",
};
