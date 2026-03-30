import test from "node:test";
import assert from "node:assert/strict";

import {
  buildWatchPanelMetrics,
  mergeBatchRecordFileContents,
  parseBatchRecordFileContent,
} from "../src/batch-record-watch-tools.mjs";

test("parseBatchRecordFileContent normalizes rows from exported batch wrapper", () => {
  const parsed = parseBatchRecordFileContent(
    JSON.stringify({
      version: 1,
      exportedAt: "2026-03-29T08:00:00.000Z",
      batches: [
        {
          updatedAt: "2026-03-29T08:10:00.000Z",
          rows: [
            { time: "2026/03/20", direction: "买入", weight: "1.2300", price: "700.00" },
            { time: "", direction: "卖出", weight: "0", price: "710" },
          ],
        },
      ],
    }),
    { filePath: "/tmp/2026-03-batch.json" }
  );

  assert.equal(parsed.error, "");
  assert.equal(parsed.filePath, "/tmp/2026-03-batch.json");
  assert.equal(parsed.batchCount, 1);
  assert.equal(parsed.rowCount, 1);
  assert.equal(parsed.latestBatchUpdatedAt, "2026-03-29T08:10:00.000Z");
  assert.deepEqual(parsed.rows, [
    { time: "2026-03-20", direction: "buy", weight: "1.23", price: "700" },
  ]);
});

test("mergeBatchRecordFileContents keeps valid rows and reports invalid files", () => {
  const merged = mergeBatchRecordFileContents([
    {
      path: "/tmp/a.json",
      modifiedAt: "2026-03-29T08:00:00.000Z",
      content: JSON.stringify({
        batches: [
          {
            updatedAt: "2026-03-29T08:01:00.000Z",
            rows: [{ time: "2026-03-20", direction: "buy", weight: "2", price: "1000" }],
          },
        ],
      }),
    },
    {
      path: "/tmp/bad.json",
      modifiedAt: "2026-03-29T08:02:00.000Z",
      content: "{not-json",
    },
  ]);

  assert.equal(merged.validFileCount, 1);
  assert.equal(merged.invalidFileCount, 1);
  assert.equal(merged.batchCount, 1);
  assert.equal(merged.rowCount, 1);
  assert.equal(merged.latestBatchUpdatedAt, "2026-03-29T08:01:00.000Z");
  assert.equal(merged.invalidFiles[0].path, "/tmp/bad.json");
  assert.equal(merged.totals.buyWeight, 2);
  assert.equal(merged.totals.buyAmount, 2000);
});

test("buildWatchPanelMetrics combines totals and portfolio metrics", () => {
  const metrics = buildWatchPanelMetrics(
    [
      { time: "2026-03-20 10:00", direction: "buy", weight: "10", price: "1000" },
      { time: "2026-03-21 10:00", direction: "sell", weight: "2", price: "1200" },
    ],
    { liveSellPrice: 1100 }
  );

  assert.equal(metrics.totals.buyWeight, 10);
  assert.equal(metrics.totals.sellWeight, 2);
  assert.equal(metrics.portfolio.currentWeight, 8);
  assert.equal(metrics.portfolio.realizedProfit, 400);
  assert.equal(metrics.portfolio.floatingProfit, 800);
});
