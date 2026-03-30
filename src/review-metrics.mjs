function toNumber(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeDirection(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "sell" || normalized === "卖出" || normalized === "委托卖出") {
    return "sell";
  }
  return "buy";
}

function formatDayLabel(value) {
  if (!value) {
    return "未识别时间";
  }

  return String(value).slice(0, 10);
}

export function calculateTotals(rows) {
  return (rows || []).reduce(
    (totals, row) => {
      const weight = toNumber(row?.weight);
      const price = toNumber(row?.price);
      const amount = weight * price;
      const direction = normalizeDirection(row?.direction);

      totals.count += 1;
      totals.turnoverAmount += amount;

      if (direction === "sell") {
        totals.sellCount += 1;
        totals.sellWeight += weight;
        totals.sellAmount += amount;
      } else {
        totals.buyCount += 1;
        totals.buyWeight += weight;
        totals.buyAmount += amount;
      }

      totals.netWeight = totals.buyWeight - totals.sellWeight;
      totals.netAmount = totals.sellAmount - totals.buyAmount;
      totals.buyAvgPrice = totals.buyWeight > 0 ? totals.buyAmount / totals.buyWeight : 0;
      totals.sellAvgPrice = totals.sellWeight > 0 ? totals.sellAmount / totals.sellWeight : 0;
      return totals;
    },
    {
      count: 0,
      buyCount: 0,
      sellCount: 0,
      buyWeight: 0,
      sellWeight: 0,
      netWeight: 0,
      buyAmount: 0,
      sellAmount: 0,
      netAmount: 0,
      turnoverAmount: 0,
      buyAvgPrice: 0,
      sellAvgPrice: 0,
    }
  );
}

export function buildDailySummaryFromRows(rows) {
  const groups = [];
  const groupMap = new Map();

  (rows || []).forEach((row) => {
    const label = formatDayLabel(row?.time);
    if (!groupMap.has(label)) {
      const group = { label, rows: [] };
      groupMap.set(label, group);
      groups.push(group);
    }

    groupMap.get(label).rows.push(row);
  });

  return groups
    .map((group) => {
      const totals = calculateTotals(group.rows);
      return {
        label: group.label,
        count: group.rows.length,
        buyWeight: totals.buyWeight,
        sellWeight: totals.sellWeight,
        netWeight: totals.netWeight,
        buyAmount: totals.buyAmount,
        sellAmount: totals.sellAmount,
        netAmount: totals.netAmount,
        buyAvgPrice: totals.buyAvgPrice,
        sellAvgPrice: totals.sellAvgPrice,
      };
    })
    .sort((left, right) => {
      const leftTime = Date.parse(left.label);
      const rightTime = Date.parse(right.label);
      const leftValid = Number.isFinite(leftTime);
      const rightValid = Number.isFinite(rightTime);

      if (!leftValid && !rightValid) {
        return left.label.localeCompare(right.label, "zh-CN");
      }
      if (!leftValid) {
        return 1;
      }
      if (!rightValid) {
        return -1;
      }
      return leftTime - rightTime;
    });
}

function chooseBucketSize(min, max) {
  const range = max - min;
  if (range <= 60) {
    return 10;
  }
  if (range <= 150) {
    return 20;
  }
  if (range <= 300) {
    return 50;
  }
  return 100;
}

export function buildPriceDistribution(rows) {
  const prices = (rows || []).map((row) => toNumber(row?.price)).filter((value) => value > 0);
  if (!prices.length) {
    return [];
  }

  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const bucketSize = chooseBucketSize(minPrice, maxPrice);
  const buckets = new Map();

  (rows || []).forEach((row) => {
    const price = toNumber(row?.price);
    const weight = toNumber(row?.weight);
    if (!price || !weight) {
      return;
    }

    const bucketStart = Math.floor(price / bucketSize) * bucketSize;
    const label = `${bucketStart}-${bucketStart + bucketSize - 1}`;
    const currentBucket = buckets.get(label) || { buyWeight: 0, sellWeight: 0 };
    if (normalizeDirection(row?.direction) === "sell") {
      currentBucket.sellWeight += weight;
    } else {
      currentBucket.buyWeight += weight;
    }
    buckets.set(label, currentBucket);
  });

  return Array.from(buckets.entries())
    .map(([label, bucket]) => ({
      label,
      buyWeight: bucket.buyWeight,
      sellWeight: bucket.sellWeight,
      netWeight: bucket.buyWeight - bucket.sellWeight,
      start: Number(label.split("-")[0]),
    }))
    .sort((left, right) => left.start - right.start);
}

export function buildBatchSummary(rows) {
  const totals = calculateTotals(rows);
  return {
    count: totals.count,
    buyWeight: totals.buyWeight,
    sellWeight: totals.sellWeight,
    netWeight: totals.netWeight,
    buyAmount: totals.buyAmount,
    sellAmount: totals.sellAmount,
    netAmount: totals.netAmount,
  };
}
