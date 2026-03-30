import {
  convertGramPriceToOuncePrice,
  convertOuncePriceToGramPrice,
} from "./portfolio-metrics.mjs";

export const GOLD_API_BASE_URL = "https://api.gold-api.com/price/XAU";
export const DEFAULT_REFRESH_INTERVAL_MS = 3_000;

function toPositiveNumber(value) {
  const numeric = Number(value) || 0;
  return numeric > 0 ? numeric : 0;
}

async function fetchQuote(fetchImpl, currency, baseUrl = GOLD_API_BASE_URL) {
  const response = await fetchImpl(`${baseUrl}/${currency}`);
  if (!response.ok) {
    throw new Error(`gold-api ${currency} 请求失败：${response.status}`);
  }

  return response.json();
}

export async function fetchLiveGoldQuotePair({
  fetchImpl = globalThis.fetch,
  baseUrl = GOLD_API_BASE_URL,
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("当前环境不支持 fetch，无法拉取实时金价");
  }

  const [cnyQuote, usdQuote] = await Promise.all([
    fetchQuote(fetchImpl, "CNY", baseUrl),
    fetchQuote(fetchImpl, "USD", baseUrl),
  ]);

  return { cnyQuote, usdQuote };
}

export function buildLiveQuoteFromBase({
  baseCnyPerGram = 0,
  baseUsdPerOz = 0,
  exchangeRate = 0,
  updatedAt = "",
  providerUpdatedAt = "",
  polledAt = "",
  buySpread = 0,
  sellSpread = 0,
} = {}) {
  const normalizedBaseCnyPerGram = toPositiveNumber(baseCnyPerGram);
  const normalizedBaseUsdPerOz = toPositiveNumber(baseUsdPerOz);
  const normalizedExchangeRate = toPositiveNumber(exchangeRate);
  const buyPriceCnyPerGram = normalizedBaseCnyPerGram + Number(buySpread || 0);
  const sellPriceCnyPerGram = normalizedBaseCnyPerGram + Number(sellSpread || 0);
  const resolvedPolledAt = polledAt || updatedAt || "";
  const resolvedProviderUpdatedAt = providerUpdatedAt || updatedAt || "";

  return {
    buyPriceCnyPerGram,
    sellPriceCnyPerGram,
    buyPriceUsdPerOz:
      normalizedExchangeRate > 0
        ? convertGramPriceToOuncePrice(buyPriceCnyPerGram) / normalizedExchangeRate
        : normalizedBaseUsdPerOz,
    sellPriceUsdPerOz:
      normalizedExchangeRate > 0
        ? convertGramPriceToOuncePrice(sellPriceCnyPerGram) / normalizedExchangeRate
        : normalizedBaseUsdPerOz,
    baseCnyPerGram: normalizedBaseCnyPerGram,
    baseUsdPerOz: normalizedBaseUsdPerOz,
    exchangeRate: normalizedExchangeRate,
    updatedAt: resolvedPolledAt,
    providerUpdatedAt: resolvedProviderUpdatedAt,
    polledAt: resolvedPolledAt,
  };
}

export function buildLiveQuoteFromApi({
  cnyQuote,
  usdQuote,
  buySpread = 0,
  sellSpread = 0,
  now = () => new Date().toISOString(),
} = {}) {
  const providerUpdatedAt = cnyQuote?.updatedAt || usdQuote?.updatedAt || "";
  const polledAt = now();

  return buildLiveQuoteFromBase({
    baseCnyPerGram: convertOuncePriceToGramPrice(cnyQuote?.price),
    baseUsdPerOz: Number(usdQuote?.price) || 0,
    exchangeRate: Number(cnyQuote?.exchangeRate) || 0,
    updatedAt: polledAt,
    providerUpdatedAt,
    polledAt,
    buySpread,
    sellSpread,
  });
}
