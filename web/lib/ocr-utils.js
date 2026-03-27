import { toNumber } from "./formatters.js";
import { normalizeDirection } from "./row-utils.js";

export function normalizeDigits(text) {
  return String(text ?? "")
    .replace(/[０-９]/g, (char) => String(char.charCodeAt(0) - 65248))
    .replace(/[，、；｜]/g, ",")
    .replace(/[。．·・]/g, ".")
    .replace(/[：]/g, ":")
    .replace(/[（]/g, "(")
    .replace(/[）]/g, ")");
}

export function sanitizeNumberText(value) {
  return String(value ?? "").replace(/,/g, "").replace(/[^0-9.]/g, "");
}

export function parseNumericValue(value) {
  const parsed = Number.parseFloat(sanitizeNumberText(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatExtractedNumber(value, decimals = 2) {
  return Number(value).toFixed(decimals).replace(/\.?0+$/, "");
}

export function roundNumericValue(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(Number(value || 0) * factor) / factor;
}

export function reconcileTradeValues({ weight = 0, price = 0, amount = 0 }) {
  let nextWeight = toNumber(weight);
  let nextPrice = toNumber(price);
  const nextAmount = toNumber(amount);

  if (nextAmount > 0 && nextWeight > 0) {
    const reconstructedPrice = roundNumericValue(nextAmount / nextWeight, 2);
    const currentAmountGap = nextPrice > 0 ? Math.abs(nextAmount - nextWeight * nextPrice) : Number.POSITIVE_INFINITY;
    const reconstructedAmountGap = Math.abs(nextAmount - nextWeight * reconstructedPrice);

    if (!nextPrice || (Math.abs(nextPrice - reconstructedPrice) <= 0.02 && reconstructedAmountGap + 0.005 < currentAmountGap)) {
      nextPrice = reconstructedPrice;
    }
  }

  if (nextAmount > 0 && nextPrice > 0) {
    const reconstructedWeight = roundNumericValue(nextAmount / nextPrice, 4);
    const currentAmountGap = nextWeight > 0 ? Math.abs(nextAmount - nextWeight * nextPrice) : Number.POSITIVE_INFINITY;
    const reconstructedAmountGap = Math.abs(nextAmount - reconstructedWeight * nextPrice);

    if (!nextWeight || (Math.abs(nextWeight - reconstructedWeight) <= 0.0002 && reconstructedAmountGap + 0.005 < currentAmountGap)) {
      nextWeight = reconstructedWeight;
    }
  }

  return {
    weight: nextWeight,
    price: nextPrice,
  };
}

export function normalizeExtractedPriceValue(value) {
  const numeric = roundNumericValue(value, 2);
  const nearestInteger = Math.round(numeric);

  if (Math.abs(numeric - nearestInteger) <= 0.011) {
    return nearestInteger;
  }

  return numeric;
}

export function extractDirectionFromText(text) {
  const normalized = normalizeOcrText(text);
  if (/委托卖出/.test(normalized)) {
    return "sell";
  }
  if (/委托买入/.test(normalized)) {
    return "buy";
  }
  return "";
}

export function normalizeOcrText(text) {
  return normalizeDigits(text)
    .replace(/\r/g, "\n")
    .replace(/[¥￥Y]/g, "¥")
    .replace(/委托买人/g, "委托买入")
    .replace(/委托卖山/g, "委托卖出")
    .replace(/过期失校/g, "过期失效")
    .replace(/过期失笑/g, "过期失效")
    .replace(/已失校/g, "已失效")
    .replace(/克教/g, "克数")
    .replace(/克效/g, "克数")
    .replace(/成父价/g, "成交价")
    .replace(/戌交价/g, "成交价")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n");
}

export function normalizeTimeValue(value) {
  const match = String(value ?? "").match(
    /(20\d{2})[-/.年]\s*(\d{1,2})[-/.月]\s*(\d{1,2})(?:[日号]?\s*(\d{1,2}:\d{2}))?/
  );
  if (!match) {
    return "";
  }

  const [, year, month, day, time = ""] = match;
  const normalizedDate = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  return time ? `${normalizedDate} ${time}` : normalizedDate;
}

export function extractTimeFromText(text) {
  return normalizeTimeValue(normalizeOcrText(text));
}

export function createStructuredRow({ time = "", direction = "buy", weight, price }) {
  const normalizedWeight = toNumber(weight);
  const normalizedPrice = normalizeExtractedPriceValue(price);

  if (normalizedWeight <= 0 || normalizedPrice <= 0) {
    return null;
  }

  return {
    time: normalizeTimeValue(time),
    direction: normalizeDirection(direction),
    weight: formatExtractedNumber(normalizedWeight, 4),
    price: formatExtractedNumber(normalizedPrice, 2),
  };
}

export function serializeStructuredRow(row) {
  const pieces = [];
  if (row.time) {
    pieces.push(row.time);
  }
  pieces.push(row.direction || "buy", row.weight, row.price);
  return pieces.join(", ");
}

export function serializeStructuredRows(rows) {
  return rows.map(serializeStructuredRow).join("\n");
}
