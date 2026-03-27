import { toNumber } from "./formatters.js";

export function normalizeDirection(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "sell" || normalized === "卖出" || normalized === "委托卖出") {
    return "sell";
  }
  return "buy";
}

export function cloneRows(rows) {
  return (rows || []).map((row) => ({
    time: row.time || "",
    direction: normalizeDirection(row.direction),
    weight: String(row.weight || ""),
    price: String(row.price || ""),
  }));
}

export function createRowKey(row) {
  return [row.time || "", row.direction || "buy", row.weight || "", row.price || ""].join("|");
}

export function getSignedWeightValue(row) {
  const weight = toNumber(row.weight);
  return normalizeDirection(row.direction) === "sell" ? -weight : weight;
}

export function getSignedAmountValue(row) {
  const weight = toNumber(row.weight);
  const price = toNumber(row.price);
  const amount = weight * price;
  return normalizeDirection(row.direction) === "sell" ? amount : -amount;
}
