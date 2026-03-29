const TROY_OUNCE_IN_GRAMS = 31.1034768;

function toPositiveNumber(value) {
  const numeric = Number.parseFloat(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function normalizeDirection(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "sell" || normalized === "卖出" || normalized === "委托卖出") {
    return "sell";
  }
  return "buy";
}

function getRowTimeValue(row) {
  const timestamp = Date.parse(row?.time || "");
  return Number.isFinite(timestamp) ? timestamp : null;
}

function sortRowsForSettlement(rows) {
  return (rows || [])
    .map((row, index) => ({
      row,
      index,
      timeValue: getRowTimeValue(row),
    }))
    .sort((left, right) => {
      const leftValid = left.timeValue !== null;
      const rightValid = right.timeValue !== null;

      if (leftValid && rightValid && left.timeValue !== right.timeValue) {
        return left.timeValue - right.timeValue;
      }
      if (leftValid !== rightValid) {
        return leftValid ? -1 : 1;
      }
      return left.index - right.index;
    })
    .map((entry) => entry.row);
}

export function calculatePortfolioMetrics(rows, { liveSellPrice = 0 } = {}) {
  let currentWeight = 0;
  let currentCost = 0;
  let cumulativeBuyAmount = 0;
  let realizedProfit = 0;
  let oversoldWeight = 0;

  sortRowsForSettlement(rows).forEach((row) => {
    const weight = toPositiveNumber(row?.weight);
    const price = toPositiveNumber(row?.price);

    if (!weight || !price) {
      return;
    }

    const amount = weight * price;
    if (normalizeDirection(row?.direction) === "sell") {
      if (currentWeight <= 0) {
        oversoldWeight += weight;
        return;
      }

      const matchedWeight = Math.min(weight, currentWeight);
      const averageCost = currentWeight > 0 ? currentCost / currentWeight : 0;
      const settledCost = averageCost * matchedWeight;

      realizedProfit += matchedWeight * price - settledCost;
      currentWeight -= matchedWeight;
      currentCost -= settledCost;

      if (currentWeight <= 1e-8) {
        currentWeight = 0;
        currentCost = 0;
      }

      if (weight > matchedWeight) {
        oversoldWeight += weight - matchedWeight;
      }
      return;
    }

    cumulativeBuyAmount += amount;
    currentWeight += weight;
    currentCost += amount;
  });

  const normalizedLiveSellPrice = toPositiveNumber(liveSellPrice);
  const hasLiveSellPrice = normalizedLiveSellPrice > 0;
  const floatingProfit =
    currentWeight > 0
      ? hasLiveSellPrice
        ? currentWeight * normalizedLiveSellPrice - currentCost
        : null
      : 0;
  const holdingReturnRate =
    currentCost > 0 ? (floatingProfit === null ? null : floatingProfit / currentCost) : 0;
  const totalProfit = floatingProfit === null ? null : realizedProfit + floatingProfit;
  const totalReturnRate =
    totalProfit === null ? null : cumulativeBuyAmount > 0 ? totalProfit / cumulativeBuyAmount : 0;

  return {
    currentWeight,
    currentCost,
    currentAvgCost: currentWeight > 0 ? currentCost / currentWeight : 0,
    cumulativeBuyAmount,
    realizedProfit,
    floatingProfit,
    holdingReturnRate,
    totalProfit,
    totalReturnRate,
    oversoldWeight,
  };
}

export function convertOuncePriceToGramPrice(pricePerOunce) {
  return toPositiveNumber(pricePerOunce) / TROY_OUNCE_IN_GRAMS;
}

export function convertOuncePriceToKilogramPrice(pricePerOunce) {
  return (toPositiveNumber(pricePerOunce) * 1000) / TROY_OUNCE_IN_GRAMS;
}

export function convertGramPriceToOuncePrice(pricePerGram) {
  return toPositiveNumber(pricePerGram) * TROY_OUNCE_IN_GRAMS;
}
