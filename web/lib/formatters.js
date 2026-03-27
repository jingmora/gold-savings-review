export function toNumber(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function trimTrailingZeros(value) {
  return String(value).replace(/(\.\d*?[1-9])0+$/u, "$1").replace(/\.0+$/u, "").replace(/\.$/u, "");
}

export function formatCurrency(value) {
  return `¥${Number(value || 0).toFixed(2)}`;
}

export function formatWeight(value) {
  return `${Number(value || 0).toFixed(3)} g`;
}

export function formatUnitPrice(value) {
  return `¥${Number(value || 0).toFixed(2)}/g`;
}

export function formatSignedWeight(value) {
  const numeric = Number(value || 0);
  const prefix = numeric > 0 ? "+" : numeric < 0 ? "-" : "";
  return `${prefix}${Math.abs(numeric).toFixed(3)} g`;
}

export function formatSignedCurrency(value) {
  const numeric = Number(value || 0);
  const prefix = numeric > 0 ? "+" : numeric < 0 ? "-" : "";
  return `${prefix}¥${Math.abs(numeric).toFixed(2)}`;
}

export function formatSignedPlain(value, decimals = 2) {
  const numeric = Number(value || 0);
  const prefix = numeric > 0 ? "+" : numeric < 0 ? "-" : "";
  return `${prefix}${Math.abs(numeric).toFixed(decimals)}`;
}

export function formatSignedPlainCompact(value, decimals = 2) {
  return trimTrailingZeros(formatSignedPlain(value, decimals));
}

export function formatPlainCompact(value, decimals = 2) {
  return trimTrailingZeros(Number(value || 0).toFixed(decimals));
}

export function formatAbsolutePlainCompact(value, decimals = 2) {
  return trimTrailingZeros(Math.abs(Number(value || 0)).toFixed(decimals));
}

export function formatDateTime(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function formatDay(value) {
  if (!value) {
    return "未识别时间";
  }

  return String(value).slice(0, 10);
}

export function sanitizeFileName(value) {
  return String(value || "交易复盘")
    .replace(/[\\/:*?"<>|]/g, "-")
    .trim();
}
