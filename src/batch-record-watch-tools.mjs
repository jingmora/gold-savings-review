import { normalizeBatchRows, parseImportedBatchPayload } from "./history-transfer-tools.mjs";
import { calculatePortfolioMetrics } from "./portfolio-metrics.mjs";
import { toNumber } from "../web/lib/formatters.js";
import { normalizeDirection } from "../web/lib/row-utils.js";

function getTimestampValue(value) {
  const timestamp = Date.parse(value || "");
  return Number.isFinite(timestamp) ? timestamp : null;
}

function pickLatestIso(left, right) {
  const leftTimestamp = getTimestampValue(left);
  const rightTimestamp = getTimestampValue(right);

  if (leftTimestamp === null) {
    return right || "";
  }
  if (rightTimestamp === null) {
    return left || "";
  }

  return rightTimestamp > leftTimestamp ? right : left;
}

export function calculateTradeTotals(rows) {
  return (rows || []).reduce(
    (totals, row) => {
      const weight = toNumber(row?.weight);
      const price = toNumber(row?.price);
      const amount = weight * price;
      const direction = normalizeDirection(row?.direction);

      totals.count += 1;
      totals.turnoverAmount += amount;

      if (direction === "sell") {
        totals.sellCount += 1;
        totals.sellWeight += weight;
        totals.sellAmount += amount;
      } else {
        totals.buyCount += 1;
        totals.buyWeight += weight;
        totals.buyAmount += amount;
      }

      totals.netWeight = totals.buyWeight - totals.sellWeight;
      totals.netAmount = totals.sellAmount - totals.buyAmount;
      totals.buyAvgPrice = totals.buyWeight > 0 ? totals.buyAmount / totals.buyWeight : 0;
      totals.sellAvgPrice = totals.sellWeight > 0 ? totals.sellAmount / totals.sellWeight : 0;

      return totals;
    },
    {
      count: 0,
      buyCount: 0,
      sellCount: 0,
      buyWeight: 0,
      sellWeight: 0,
      netWeight: 0,
      buyAmount: 0,
      sellAmount: 0,
      netAmount: 0,
      turnoverAmount: 0,
      buyAvgPrice: 0,
      sellAvgPrice: 0,
    }
  );
}

export function parseBatchRecordFileContent(content, { filePath = "" } = {}) {
  let payload;
  try {
    payload = JSON.parse(String(content || ""));
  } catch (error) {
    return {
      filePath,
      batchCount: 0,
      rowCount: 0,
      rows: [],
      latestBatchUpdatedAt: "",
      exportedAt: "",
      error: `JSON 解析失败：${error instanceof Error ? error.message : "文件内容不可解析"}`,
    };
  }

  let batches;
  try {
    batches = parseImportedBatchPayload(payload);
  } catch (error) {
    return {
      filePath,
      batchCount: 0,
      rowCount: 0,
      rows: [],
      latestBatchUpdatedAt: "",
      exportedAt: "",
      error: error instanceof Error ? error.message : "JSON 文件格式不正确",
    };
  }

  const exportedAt = typeof payload?.exportedAt === "string" ? payload.exportedAt : "";
  const rows = [];
  let latestBatchUpdatedAt = exportedAt;

  batches.forEach((batch) => {
    const normalizedRows = normalizeBatchRows(batch?.rows || []);
    rows.push(...normalizedRows);
    latestBatchUpdatedAt = pickLatestIso(
      latestBatchUpdatedAt,
      batch?.updatedAt || batch?.createdAt || exportedAt
    );
  });

  return {
    filePath,
    batchCount: batches.length,
    rowCount: rows.length,
    rows,
    latestBatchUpdatedAt,
    exportedAt,
    error: "",
  };
}

export function mergeBatchRecordFileContents(files) {
  const rows = [];
  const validFiles = [];
  const invalidFiles = [];
  let batchCount = 0;
  let latestBatchUpdatedAt = "";

  (files || []).forEach((file) => {
    if (typeof file?.content !== "string") {
      invalidFiles.push({
        path: String(file?.path || ""),
        error: file?.error || "文件内容不可用",
      });
      return;
    }

    const parsed = parseBatchRecordFileContent(file.content, {
      filePath: String(file?.path || ""),
    });

    if (parsed.error) {
      invalidFiles.push({
        path: parsed.filePath,
        error: parsed.error,
      });
      return;
    }

    rows.push(...parsed.rows);
    batchCount += parsed.batchCount;
    latestBatchUpdatedAt = pickLatestIso(
      latestBatchUpdatedAt,
      parsed.latestBatchUpdatedAt || file?.modifiedAt || ""
    );
    validFiles.push({
      path: parsed.filePath,
      batchCount: parsed.batchCount,
      rowCount: parsed.rowCount,
      modifiedAt: String(file?.modifiedAt || ""),
      latestBatchUpdatedAt: parsed.latestBatchUpdatedAt,
    });
  });

  return {
    rows,
    totals: calculateTradeTotals(rows),
    fileCount: (files || []).length,
    validFiles,
    invalidFiles,
    validFileCount: validFiles.length,
    invalidFileCount: invalidFiles.length,
    batchCount,
    rowCount: rows.length,
    latestBatchUpdatedAt,
  };
}

export function buildWatchPanelMetrics(rows, { liveSellPrice = 0 } = {}) {
  return {
    totals: calculateTradeTotals(rows),
    portfolio: calculatePortfolioMetrics(rows, { liveSellPrice }),
  };
}
