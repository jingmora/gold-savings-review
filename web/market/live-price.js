import {
  buildLiveQuoteFromApi,
  DEFAULT_REFRESH_INTERVAL_MS,
  fetchLiveGoldQuotePair,
} from "../../src/live-price-tools.mjs";

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

    refreshPromise = fetchLiveGoldQuotePair({
      fetchImpl: globalThis.fetch.bind(globalThis),
    })
      .then(({ cnyQuote, usdQuote }) => {
        marketState.quote = buildLiveQuoteFromApi({
          cnyQuote,
          usdQuote,
          buySpread: marketState.buySpread,
          sellSpread: marketState.sellSpread,
        });
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
