import {
  formatCurrency,
  formatSignedCurrency,
  formatSignedPercent,
  formatUnitPrice,
  formatWeight,
} from "../lib/formatters.js";

export function createWorkspaceSummaryApi({
  calculateTotals,
  elements,
  getDisplayRows,
  getLiveMarketSnapshot,
}) {
  function setSignedMetric(node, value, formatter) {
    if (!Number.isFinite(value)) {
      node.textContent = "--";
      node.classList.remove("is-positive", "is-negative");
      return;
    }

    node.textContent = formatter(value);
    node.classList.remove("is-positive", "is-negative");
    if (value > 0) {
      node.classList.add("is-positive");
    } else if (value < 0) {
      node.classList.add("is-negative");
    }
  }

  function renderSummary() {
    const rows = getDisplayRows();
    const totals = calculateTotals(rows);
    const liveMarket = getLiveMarketSnapshot();
    const buyAvgText = totals.buyWeight > 0 ? formatUnitPrice(totals.buyAvgPrice) : "暂无";
    const sellAvgText = totals.sellWeight > 0 ? formatUnitPrice(totals.sellAvgPrice) : "暂无";

    elements.summaryBuyAvg.textContent = buyAvgText;
    elements.summarySellAvg.textContent = sellAvgText;
    elements.summaryBuyWeight.textContent = formatWeight(totals.buyWeight);
    elements.summarySellWeight.textContent = formatWeight(totals.sellWeight);
    elements.summaryBuyAmount.textContent = formatCurrency(totals.buyAmount);
    elements.summarySellAmount.textContent = formatCurrency(totals.sellAmount);

    elements.liveBuyPriceCny.textContent = liveMarket.buyPriceCnyText;
    elements.liveBuyPriceUsd.textContent = liveMarket.buyPriceUsdText;
    elements.liveSellPriceCny.textContent = liveMarket.sellPriceCnyText;
    elements.liveSellPriceUsd.textContent = liveMarket.sellPriceUsdText;
    elements.livePriceStatus.textContent = liveMarket.statusText;
    elements.livePriceStatus.classList.toggle("is-error", liveMarket.statusTone === "error");

    setSignedMetric(elements.realizedProfit, liveMarket.realizedProfit, formatSignedCurrency);
    setSignedMetric(elements.floatingProfit, liveMarket.floatingProfit, formatSignedCurrency);
    setSignedMetric(elements.holdingReturnRate, liveMarket.holdingReturnRate, formatSignedPercent);
    setSignedMetric(elements.totalReturnRate, liveMarket.totalReturnRate, formatSignedPercent);
  }

  return {
    renderSummary,
  };
}
