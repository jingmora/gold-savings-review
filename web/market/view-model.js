import {
  formatDateTimeWithSeconds,
  formatUnitPrice,
} from "../lib/formatters.js";
import { calculatePortfolioMetrics } from "../../src/portfolio-metrics.mjs";

function formatUsdPerOunce(value) {
  return value > 0 ? `$${Number(value).toFixed(2)}/oz` : "--";
}

function getComexSessionState(now = new Date()) {
  const utcHour = now.getUTCHours();
  const utcMinute = now.getUTCMinutes();
  const totalMinutes = utcHour * 60 + utcMinute;
  const sessionStart = 23 * 60;
  const sessionEnd = 21 * 60;
  const isOpen = totalMinutes >= sessionStart || totalMinutes < sessionEnd;
  return isOpen ? "国际金市交易中" : "国际金市休市中";
}

function buildLivePriceStatusText(marketState) {
  if (marketState.status === "error") {
    return marketState.error || "实时行情暂不可用";
  }

  if (!marketState.quote) {
    return marketState.status === "loading" ? "行情加载中…" : "暂无实时行情";
  }

  const updatedAt = marketState.quote.polledAt
    ? formatDateTimeWithSeconds(marketState.quote.polledAt)
    : "";
  const marketSessionState = getComexSessionState();
  const suffix = updatedAt ? ` · 本地刷新 ${updatedAt}` : "";

  if (marketState.status === "refreshing") {
    return suffix ? `${marketSessionState}${suffix}` : `${marketSessionState} · 行情更新中…`;
  }

  return suffix ? `${marketSessionState}${suffix}` : marketSessionState;
}

export function buildLiveMarketSnapshot({ rows, marketState }) {
  const quote = marketState.quote;
  const portfolioMetrics = calculatePortfolioMetrics(rows, {
    liveSellPrice: quote?.sellPriceCnyPerGram ?? 0,
  });

  return {
    buyPriceCnyText: quote ? formatUnitPrice(quote.buyPriceCnyPerGram) : "--",
    buyPriceUsdText: quote ? formatUsdPerOunce(quote.buyPriceUsdPerOz) : "--",
    sellPriceCnyText: quote ? formatUnitPrice(quote.sellPriceCnyPerGram) : "--",
    sellPriceUsdText: quote ? formatUsdPerOunce(quote.sellPriceUsdPerOz) : "--",
    statusText: buildLivePriceStatusText(marketState),
    statusTone: marketState.status === "error" ? "error" : "default",
    realizedProfit: portfolioMetrics.realizedProfit,
    floatingProfit: portfolioMetrics.floatingProfit,
    holdingReturnRate: portfolioMetrics.holdingReturnRate,
    totalReturnRate: portfolioMetrics.totalReturnRate,
  };
}
