import { DIRECTION_LABELS } from "../config.js";
import { normalizeDirection } from "../lib/row-utils.js";
import { buildLiveQuoteFromBase } from "../../src/live-price-tools.mjs";
import { buildLiveMarketSnapshot } from "../market/view-model.js";

export function createShellMarketApi({
  getDisplayRows,
  marketState,
  update,
}) {
  function getDirectionLabel(value) {
    return DIRECTION_LABELS[normalizeDirection(value)];
  }

  function rebuildLiveQuoteWithSpreads() {
    if (!marketState.quote) {
      return;
    }

    marketState.quote = buildLiveQuoteFromBase({
      baseCnyPerGram: marketState.quote.baseCnyPerGram,
      baseUsdPerOz: marketState.quote.baseUsdPerOz,
      exchangeRate: marketState.quote.exchangeRate,
      updatedAt: marketState.quote.updatedAt,
      providerUpdatedAt: marketState.quote.providerUpdatedAt,
      polledAt: marketState.quote.polledAt,
      buySpread: marketState.buySpread,
      sellSpread: marketState.sellSpread,
    });
  }

  function setLivePriceSpreads({ buySpread, sellSpread } = {}) {
    marketState.buySpread = Number.parseFloat(buySpread) || 0;
    marketState.sellSpread = Number.parseFloat(sellSpread) || 0;
    rebuildLiveQuoteWithSpreads();
    update();
  }

  function getLiveMarketSnapshot() {
    return buildLiveMarketSnapshot({
      rows: getDisplayRows(),
      marketState,
    });
  }

  return {
    getDirectionLabel,
    getLiveMarketSnapshot,
    setLivePriceSpreads,
  };
}
