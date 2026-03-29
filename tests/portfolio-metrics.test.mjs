import test from "node:test";
import assert from "node:assert/strict";

import {
  calculatePortfolioMetrics,
  convertGramPriceToOuncePrice,
  convertOuncePriceToGramPrice,
  convertOuncePriceToKilogramPrice,
} from "../src/portfolio-metrics.mjs";

test("calculatePortfolioMetrics settles realized and floating profit with moving average cost", () => {
  const metrics = calculatePortfolioMetrics(
    [
      { time: "2026-03-20 10:00", direction: "buy", weight: "10", price: "1000" },
      { time: "2026-03-21 10:00", direction: "buy", weight: "10", price: "1200" },
      { time: "2026-03-22 10:00", direction: "sell", weight: "5", price: "1300" },
    ],
    { liveSellPrice: 1250 }
  );

  assert.equal(metrics.currentWeight, 15);
  assert.equal(metrics.currentCost, 16500);
  assert.equal(metrics.currentAvgCost, 1100);
  assert.equal(metrics.cumulativeBuyAmount, 22000);
  assert.equal(metrics.realizedProfit, 1000);
  assert.equal(metrics.floatingProfit, 2250);
  assert.equal(metrics.totalProfit, 3250);
  assert.equal(metrics.holdingReturnRate, 2250 / 16500);
  assert.equal(metrics.totalReturnRate, 3250 / 22000);
});

test("calculatePortfolioMetrics ignores oversold remainder in remaining holding cost", () => {
  const metrics = calculatePortfolioMetrics(
    [
      { time: "2026-03-20 10:00", direction: "buy", weight: "2", price: "1000" },
      { time: "2026-03-21 10:00", direction: "sell", weight: "3", price: "1200" },
    ],
    { liveSellPrice: 1300 }
  );

  assert.equal(metrics.currentWeight, 0);
  assert.equal(metrics.currentCost, 0);
  assert.equal(metrics.realizedProfit, 400);
  assert.equal(metrics.floatingProfit, 0);
  assert.equal(metrics.oversoldWeight, 1);
});

test("calculatePortfolioMetrics keeps floating metrics unavailable until live sell price is ready", () => {
  const metrics = calculatePortfolioMetrics([
    { time: "2026-03-20 10:00", direction: "buy", weight: "2", price: "1000" },
  ]);

  assert.equal(metrics.realizedProfit, 0);
  assert.equal(metrics.floatingProfit, null);
  assert.equal(metrics.holdingReturnRate, null);
  assert.equal(metrics.totalProfit, null);
  assert.equal(metrics.totalReturnRate, null);
});

test("price conversion helpers convert ounce quotes into gram and kilogram views", () => {
  assert.equal(convertOuncePriceToGramPrice(31115.289).toFixed(3), "1000.380");
  assert.equal(convertOuncePriceToKilogramPrice(4495).toFixed(2), "144517.61");
  assert.equal(convertGramPriceToOuncePrice(1000.38).toFixed(2), "31115.30");
});
