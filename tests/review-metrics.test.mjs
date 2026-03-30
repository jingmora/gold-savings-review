import test from "node:test";
import assert from "node:assert/strict";

import {
  buildBatchSummary,
  buildDailySummaryFromRows,
  buildPriceDistribution,
  calculateTotals,
} from "../src/review-metrics.mjs";

test("calculateTotals derives buy sell and net metrics", () => {
  const totals = calculateTotals([
    { time: "2026-03-20 10:00", direction: "buy", weight: "2", price: "700" },
    { time: "2026-03-21 10:00", direction: "sell", weight: "0.5", price: "760" },
  ]);

  assert.deepEqual(totals, {
    count: 2,
    buyCount: 1,
    sellCount: 1,
    buyWeight: 2,
    sellWeight: 0.5,
    netWeight: 1.5,
    buyAmount: 1400,
    sellAmount: 380,
    netAmount: -1020,
    turnoverAmount: 1780,
    buyAvgPrice: 700,
    sellAvgPrice: 760,
  });
});

test("buildDailySummaryFromRows groups by day and sorts ascending", () => {
  const dailyRows = buildDailySummaryFromRows([
    { time: "2026-03-21 10:00", direction: "sell", weight: "1", price: "760" },
    { time: "2026-03-20 10:00", direction: "buy", weight: "2", price: "700" },
    { time: "", direction: "buy", weight: "0.5", price: "690" },
  ]);

  assert.deepEqual(dailyRows, [
    {
      label: "2026-03-20",
      count: 1,
      buyWeight: 2,
      sellWeight: 0,
      netWeight: 2,
      buyAmount: 1400,
      sellAmount: 0,
      netAmount: -1400,
      buyAvgPrice: 700,
      sellAvgPrice: 0,
    },
    {
      label: "2026-03-21",
      count: 1,
      buyWeight: 0,
      sellWeight: 1,
      netWeight: -1,
      buyAmount: 0,
      sellAmount: 760,
      netAmount: 760,
      buyAvgPrice: 0,
      sellAvgPrice: 760,
    },
    {
      label: "未识别时间",
      count: 1,
      buyWeight: 0.5,
      sellWeight: 0,
      netWeight: 0.5,
      buyAmount: 345,
      sellAmount: 0,
      netAmount: -345,
      buyAvgPrice: 690,
      sellAvgPrice: 0,
    },
  ]);
});

test("buildPriceDistribution buckets buy and sell weights", () => {
  const distribution = buildPriceDistribution([
    { direction: "buy", weight: "1", price: "701" },
    { direction: "buy", weight: "2", price: "708" },
    { direction: "sell", weight: "0.5", price: "715" },
  ]);

  assert.deepEqual(distribution, [
    {
      label: "700-709",
      buyWeight: 3,
      sellWeight: 0,
      netWeight: 3,
      start: 700,
    },
    {
      label: "710-719",
      buyWeight: 0,
      sellWeight: 0.5,
      netWeight: -0.5,
      start: 710,
    },
  ]);
});

test("buildBatchSummary returns the persisted summary shape", () => {
  const summary = buildBatchSummary([
    { direction: "buy", weight: "1", price: "700" },
    { direction: "sell", weight: "0.25", price: "750" },
  ]);

  assert.deepEqual(summary, {
    count: 2,
    buyWeight: 1,
    sellWeight: 0.25,
    netWeight: 0.75,
    buyAmount: 700,
    sellAmount: 187.5,
    netAmount: -512.5,
  });
});
