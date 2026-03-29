import {
  convertGramPriceToOuncePrice,
  convertOuncePriceToGramPrice,
} from "../../src/portfolio-metrics.mjs";

// 当前实时金价模块先使用 Gold API 作为轻量参考价源：
// 1. 无需 API key，适合本地网页直接调用
// 2. 可同时返回 XAU/CNY 与 XAU/USD，便于结果总览展示
// 3. 这里展示的是公开聚合市场参考价，不是招行官方买卖盘
const GOLD_API_BASE_URL = "https://api.gold-api.com/price/XAU";
export const DEFAULT_REFRESH_INTERVAL_MS = 3_000;

async function fetchQuote(currency) {
  const response = await fetch(`${GOLD_API_BASE_URL}/${currency}`);
  if (!response.ok) {
    throw new Error(`gold-api ${currency} 请求失败：${response.status}`);
  }

  return response.json();
}

export function createLivePriceApi({
  marketState,
  update,
  refreshIntervalMs = DEFAULT_REFRESH_INTERVAL_MS,
} = {}) {
  let refreshPromise = null;

  async function refreshLivePrice() {
    if (refreshPromise) {
      return refreshPromise;
    }

    marketState.status = marketState.quote ? "refreshing" : "loading";
    marketState.error = "";
    update();

    refreshPromise = Promise.all([fetchQuote("CNY"), fetchQuote("USD")])
      .then(([cnyQuote, usdQuote]) => {
        const exchangeRate = Number(cnyQuote.exchangeRate) || 0;
        const baseCnyPerGram = convertOuncePriceToGramPrice(cnyQuote.price);
        const baseUsdPerOz = Number(usdQuote.price) || 0;
        const buyPriceCnyPerGram = baseCnyPerGram + Number(marketState.buySpread || 0);
        const sellPriceCnyPerGram = baseCnyPerGram + Number(marketState.sellSpread || 0);
        const buyPriceUsdPerOz =
          exchangeRate > 0
            ? convertGramPriceToOuncePrice(buyPriceCnyPerGram) / exchangeRate
            : baseUsdPerOz;
        const sellPriceUsdPerOz =
          exchangeRate > 0
            ? convertGramPriceToOuncePrice(sellPriceCnyPerGram) / exchangeRate
            : baseUsdPerOz;

        marketState.quote = {
          buyPriceCnyPerGram,
          sellPriceCnyPerGram,
          buyPriceUsdPerOz,
          sellPriceUsdPerOz,
          baseCnyPerGram,
          baseUsdPerOz,
          exchangeRate,
          updatedAt: cnyQuote.updatedAt || usdQuote.updatedAt || "",
        };
        marketState.status = "ready";
        marketState.error = "";
      })
      .catch((error) => {
        marketState.status = "error";
        marketState.error = error instanceof Error ? error.message : "行情加载失败";
      })
      .finally(() => {
        refreshPromise = null;
        update();
      });

    return refreshPromise;
  }

  function startLivePricePolling() {
    if (marketState.refreshTimerId) {
      clearInterval(marketState.refreshTimerId);
    }

    void refreshLivePrice();
    marketState.refreshTimerId = window.setInterval(() => {
      void refreshLivePrice();
    }, refreshIntervalMs);
  }

  function stopLivePricePolling() {
    if (!marketState.refreshTimerId) {
      return;
    }

    clearInterval(marketState.refreshTimerId);
    marketState.refreshTimerId = null;
  }

  return {
    refreshLivePrice,
    startLivePricePolling,
    stopLivePricePolling,
  };
}
