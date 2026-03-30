import test from "node:test";
import assert from "node:assert/strict";

import {
  buildLiveQuoteFromApi,
  buildLiveQuoteFromBase,
  fetchLiveGoldQuotePair,
} from "../src/live-price-tools.mjs";

test("buildLiveQuoteFromBase applies local spreads and keeps raw base fields", () => {
  const quote = buildLiveQuoteFromBase({
    baseCnyPerGram: 720,
    baseUsdPerOz: 3100,
    exchangeRate: 7.2,
    updatedAt: "2026-03-29T09:00:00.000Z",
    providerUpdatedAt: "2026-03-29T08:59:30.000Z",
    polledAt: "2026-03-29T09:00:00.000Z",
    buySpread: 5,
    sellSpread: -3,
  });

  assert.equal(quote.baseCnyPerGram, 720);
  assert.equal(quote.buyPriceCnyPerGram, 725);
  assert.equal(quote.sellPriceCnyPerGram, 717);
  assert.equal(quote.exchangeRate, 7.2);
  assert.equal(quote.updatedAt, "2026-03-29T09:00:00.000Z");
  assert.equal(quote.providerUpdatedAt, "2026-03-29T08:59:30.000Z");
  assert.equal(quote.polledAt, "2026-03-29T09:00:00.000Z");
  assert.ok(quote.buyPriceUsdPerOz > 0);
  assert.ok(quote.sellPriceUsdPerOz > 0);
});

test("buildLiveQuoteFromApi derives gram quote from ounce api payload", () => {
  const quote = buildLiveQuoteFromApi({
    cnyQuote: {
      price: 22151.1486,
      exchangeRate: 7.2,
      updatedAt: "2026-03-29T09:01:00.000Z",
    },
    usdQuote: {
      price: 3076.55,
      updatedAt: "2026-03-29T09:01:00.000Z",
    },
    buySpread: 2,
    sellSpread: -1,
    now() {
      return "2026-03-29T09:01:03.000Z";
    },
  });

  assert.equal(quote.baseCnyPerGram.toFixed(3), "712.176");
  assert.equal(quote.buyPriceCnyPerGram.toFixed(3), "714.176");
  assert.equal(quote.sellPriceCnyPerGram.toFixed(3), "711.176");
  assert.equal(quote.baseUsdPerOz, 3076.55);
  assert.equal(quote.updatedAt, "2026-03-29T09:01:03.000Z");
  assert.equal(quote.providerUpdatedAt, "2026-03-29T09:01:00.000Z");
  assert.equal(quote.polledAt, "2026-03-29T09:01:03.000Z");
});

test("fetchLiveGoldQuotePair requests both CNY and USD quotes", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return {
      ok: true,
      async json() {
        return { price: url.endsWith("/CNY") ? 22000 : 3050, exchangeRate: 7.2 };
      },
    };
  };

  const result = await fetchLiveGoldQuotePair({
    fetchImpl,
    baseUrl: "https://example.com/price/XAU",
  });

  assert.deepEqual(calls, [
    "https://example.com/price/XAU/CNY",
    "https://example.com/price/XAU/USD",
  ]);
  assert.equal(result.cnyQuote.price, 22000);
  assert.equal(result.usdQuote.price, 3050);
});
