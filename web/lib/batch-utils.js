export function createBatchId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `batch-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

export function defaultBatchName() {
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return `${date}-batch`;
}

export function defaultDuplicateBatchName(sourceName = "") {
  const normalized = String(sourceName || "").trim();
  return normalized ? `${normalized}-copy` : defaultBatchName();
}

export function normalizeLegacyBatchName(value) {
  const normalized = String(value || "").trim();
  const datedBatchMatch = normalized.match(/^(\d{4}-\d{2}-\d{2})(?:\s+|\-)?(?:(买入|卖出|统计))?批次$/);
  if (datedBatchMatch) {
    return `${datedBatchMatch[1]}-batch`;
  }

  const spacedBatchMatch = normalized.match(/^(\d{4}-\d{2}-\d{2})\s+batch$/i);
  if (spacedBatchMatch) {
    return `${spacedBatchMatch[1]}-batch`;
  }

  return normalized;
}
