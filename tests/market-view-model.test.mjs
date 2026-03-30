import test from "node:test";
import assert from "node:assert/strict";

import { buildLiveMarketSnapshot } from "../web/market/view-model.js";

test("buildLiveMarketSnapshot returns loading placeholders before quote is ready", () => {
  const snapshot = buildLiveMarketSnapshot({
    rows: [{ time: "2026-03-20 10:00", direction: "buy", weight: "2", price: "700" }],
    marketState: {
      status: "loading",
      quote: null,
      error: "",
    },
  });

  assert.equal(snapshot.buyPriceCnyText, "--");
  assert.equal(snapshot.sellPriceCnyText, "--");
  assert.equal(snapshot.statusText, "行情加载中…");
  assert.equal(snapshot.statusTone, "default");
  assert.equal(snapshot.floatingProfit, null);
});

test("buildLiveMarketSnapshot exposes formatted prices and portfolio metrics when quote is ready", () => {
  const snapshot = buildLiveMarketSnapshot({
    rows: [
      { time: "2026-03-20 10:00", direction: "buy", weight: "10", price: "1000" },
      { time: "2026-03-21 10:00", direction: "sell", weight: "2", price: "1200" },
    ],
    marketState: {
      status: "ready",
      error: "",
      quote: {
        buyPriceCnyPerGram: 1105,
        buyPriceUsdPerOz: 3000.12,
        sellPriceCnyPerGram: 1100,
        sellPriceUsdPerOz: 2988.34,
        polledAt: "2026-03-30T08:00:00.000Z",
      },
    },
  });

  assert.equal(snapshot.buyPriceCnyText, "¥1105.00/g");
  assert.equal(snapshot.buyPriceUsdText, "$3000.12/oz");
  assert.equal(snapshot.sellPriceCnyText, "¥1100.00/g");
  assert.equal(snapshot.sellPriceUsdText, "$2988.34/oz");
  assert.match(snapshot.statusText, /本地刷新 \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  assert.equal(snapshot.realizedProfit, 400);
  assert.equal(snapshot.floatingProfit, 800);
  assert.equal(snapshot.holdingReturnRate, 0.1);
  assert.equal(snapshot.totalReturnRate, 0.12);
});

test("buildLiveMarketSnapshot surfaces market errors", () => {
  const snapshot = buildLiveMarketSnapshot({
    rows: [],
    marketState: {
      status: "error",
      error: "行情源不可用",
      quote: null,
    },
  });

  assert.equal(snapshot.statusText, "行情源不可用");
  assert.equal(snapshot.statusTone, "error");
});
