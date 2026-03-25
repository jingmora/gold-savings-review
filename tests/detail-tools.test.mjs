import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDuplicateCountMap,
  getRowAnomalies,
  getTimeValue,
  sortRowEntries,
} from "../src/detail-tools.mjs";

test("getTimeValue returns null for invalid time", () => {
  assert.equal(getTimeValue(""), null);
  assert.equal(getTimeValue("invalid"), null);
});

test("sortRowEntries sorts by time desc by default", () => {
  const entries = [
    { row: { time: "2026-03-18 10:00", weight: "2", price: "700" } },
    { row: { time: "2026-03-20 10:00", weight: "1", price: "800" } },
  ];

  const result = sortRowEntries(entries, "time-desc");
  assert.equal(result[0].row.time, "2026-03-20 10:00");
});

test("sortRowEntries sorts by weight asc", () => {
  const entries = [
    { row: { time: "2026-03-18 10:00", weight: "5", price: "700" } },
    { row: { time: "2026-03-20 10:00", weight: "1", price: "800" } },
  ];

  const result = sortRowEntries(entries, "weight-asc");
  assert.equal(result[0].row.weight, "1");
});

test("buildDuplicateCountMap counts duplicate rows", () => {
  const rows = [
    { time: "2026-03-20 10:00", direction: "buy", weight: "1", price: "700" },
    { time: "2026-03-20 10:00", direction: "buy", weight: "1", price: "700" },
  ];

  const counts = buildDuplicateCountMap(rows, (row) => JSON.stringify(row));
  assert.equal(counts.get(JSON.stringify(rows[0])), 2);
});

test("getRowAnomalies detects missing time, suspicious price and duplicates", () => {
  const anomalies = getRowAnomalies(
    { time: "", direction: "buy", weight: "1", price: "50" },
    { duplicateCount: 2 }
  );

  assert.deepEqual(anomalies, ["时间缺失", "单价异常", "疑似重复"]);
});
