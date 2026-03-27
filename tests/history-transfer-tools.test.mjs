import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeBatchRows,
  parseImportedBatchPayload,
  toPortableBatchRecord,
} from "../src/history-transfer-tools.mjs";

test("parseImportedBatchPayload accepts both top-level array and batches wrapper", () => {
  const batches = [{ id: "batch-1" }, { id: "batch-2" }];

  assert.equal(parseImportedBatchPayload(batches), batches);
  assert.equal(parseImportedBatchPayload({ batches }), batches);
});

test("normalizeBatchRows filters invalid rows and normalizes valid rows", () => {
  const rows = normalizeBatchRows([
    { time: "2026/03/20", direction: "买入", weight: "1.2300", price: "700.00" },
    { time: "2026-03-20", direction: "sell", weight: "0", price: "705" },
    { time: "", direction: "卖出", weight: "2.5", price: "710.001" },
  ]);

  assert.deepEqual(rows, [
    { time: "2026-03-20", direction: "buy", weight: "1.23", price: "700" },
    { time: "", direction: "sell", weight: "2.5", price: "710" },
  ]);
});

test("toPortableBatchRecord normalizes legacy names and derives summaries", () => {
  const record = toPortableBatchRecord(
    {
      id: "legacy-batch",
      name: "2026-03-20 买入批次",
      rows: [
        { time: "2026-03-20", direction: "buy", weight: "1", price: "700" },
        { time: "2026-03-21", direction: "sell", weight: "0", price: "710" },
      ],
    },
    {
      buildBatchSummary(rows) {
        return { count: rows.length, totalWeight: rows.reduce((sum, row) => sum + Number(row.weight), 0) };
      },
      buildDailySummaryFromRows(rows) {
        return rows.map((row) => row.time);
      },
      idFactory() {
        return "generated-id";
      },
      now() {
        return "2026-03-26T10:00:00.000Z";
      },
    }
  );

  assert.deepEqual(record, {
    id: "legacy-batch",
    name: "2026-03-20-batch",
    createdAt: "2026-03-26T10:00:00.000Z",
    updatedAt: "2026-03-26T10:00:00.000Z",
    rows: [{ time: "2026-03-20", direction: "buy", weight: "1", price: "700" }],
    summary: { count: 1, totalWeight: 1 },
    dailySummary: ["2026-03-20"],
  });
});
