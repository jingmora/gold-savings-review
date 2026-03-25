export function getTimeValue(value) {
  const timestamp = new Date(value || "").getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function sortRowEntries(entries, sortValue = "time-desc") {
  return [...(entries || [])]
    .map((entry, index) => ({ entry, index }))
    .sort((left, right) => {
      let comparison = 0;

      if (sortValue === "time-desc" || sortValue === "time-asc") {
        const leftTime = getTimeValue(left.entry.row?.time);
        const rightTime = getTimeValue(right.entry.row?.time);
        if (leftTime === null && rightTime === null) {
          comparison = 0;
        } else if (leftTime === null) {
          comparison = 1;
        } else if (rightTime === null) {
          comparison = -1;
        } else {
          comparison = leftTime - rightTime;
        }
        if (sortValue === "time-desc") {
          comparison *= -1;
        }
      }

      if (sortValue === "weight-desc" || sortValue === "weight-asc") {
        comparison = Number(left.entry.row?.weight || 0) - Number(right.entry.row?.weight || 0);
        if (sortValue === "weight-desc") {
          comparison *= -1;
        }
      }

      if (sortValue === "price-desc" || sortValue === "price-asc") {
        comparison = Number(left.entry.row?.price || 0) - Number(right.entry.row?.price || 0);
        if (sortValue === "price-desc") {
          comparison *= -1;
        }
      }

      return comparison || left.index - right.index;
    })
    .map((entry) => entry.entry);
}

export function buildDuplicateCountMap(rows, getRowKey) {
  const counts = new Map();

  (rows || []).forEach((row) => {
    const key = getRowKey(row);
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  return counts;
}

export function getRowAnomalies(row, { duplicateCount = 0 } = {}) {
  const issues = [];
  const weight = Number(row?.weight || 0);
  const price = Number(row?.price || 0);

  if (!row?.time || getTimeValue(row.time) === null) {
    issues.push("时间缺失");
  }

  if (!Number.isFinite(weight) || weight <= 0) {
    issues.push("克重无效");
  } else if (weight > 100) {
    issues.push("克重异常");
  }

  if (!Number.isFinite(price) || price <= 0) {
    issues.push("单价无效");
  } else if (price < 100 || price > 10000) {
    issues.push("单价异常");
  }

  if (duplicateCount > 1) {
    issues.push("疑似重复");
  }

  return issues;
}
