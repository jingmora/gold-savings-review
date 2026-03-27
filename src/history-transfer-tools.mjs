import {
  createBatchId,
  defaultBatchName,
  normalizeLegacyBatchName,
} from "../web/lib/batch-utils.js";
import { createStructuredRow } from "../web/lib/ocr-utils.js";

export function normalizeBatchRows(rows, { rowFactory = createStructuredRow } = {}) {
  return (rows || [])
    .map((row) =>
      rowFactory({
        time: row?.time || "",
        direction: row?.direction || "buy",
        weight: row?.weight,
        price: row?.price,
      })
    )
    .filter(Boolean);
}

export function toPortableBatchRecord(
  batch,
  {
    buildBatchSummary,
    buildDailySummaryFromRows,
    idFactory = createBatchId,
    nameNormalizer = normalizeLegacyBatchName,
    fallbackName = defaultBatchName,
    rowFactory = createStructuredRow,
    now = () => new Date().toISOString(),
  } = {}
) {
  const rows = normalizeBatchRows(batch?.rows || [], { rowFactory });
  const createdAt = batch?.createdAt || now();
  const updatedAt = batch?.updatedAt || createdAt;
  const resolvedName = nameNormalizer(batch?.name) || fallbackName();

  return {
    id: batch?.id || idFactory(),
    name: resolvedName,
    createdAt,
    updatedAt,
    rows,
    summary: batch?.summary || buildBatchSummary(rows),
    dailySummary: batch?.dailySummary || buildDailySummaryFromRows(rows),
  };
}

export function parseImportedBatchPayload(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.batches)) {
    return payload.batches;
  }

  throw new Error("JSON 文件格式不正确");
}
