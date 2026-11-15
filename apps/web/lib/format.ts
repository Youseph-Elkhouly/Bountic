import { formatUnits, parseUnits } from "viem";

/** GOAT's native asset. Escrow amounts are stored as integer base units (18 decimals). */
export const NATIVE_SYMBOL = "BTC";
export const NATIVE_DECIMALS = 18;
export const EXPLORER_URL = "https://explorer.testnet3.goat.network";

type Base = string | number | bigint;

/** Exact base units with thousands separators, e.g. "100,000,000,000,000". */
export function baseUnits(value: Base) {
  return BigInt(value).toLocaleString("en-US");
}

/** Human amount in the native asset, at most 8 decimals, e.g. "0.0001". */
export function coin(value: Base) {
  const exact = formatUnits(BigInt(value), NATIVE_DECIMALS);
  const [whole, fraction = ""] = exact.split(".");
  const kept = fraction.slice(0, 8).replace(/0+$/, "");
  if (!kept && whole === "0" && /[1-9]/.test(fraction)) return "<0.00000001";
  return kept ? `${whole}.${kept}` : whole;
}

/** "0.0001" → "100000000000000". Returns null when the text is not a valid amount. */
export function toBaseUnits(text: string) {
  const clean = text.trim();
  if (!/^\d+(\.\d{1,18})?$/.test(clean)) return null;
  try { return parseUnits(clean, NATIVE_DECIMALS).toString(); } catch { return null; }
}

export function fromBaseUnits(value: Base) {
  return formatUnits(BigInt(value), NATIVE_DECIMALS);
}

export function shortHash(value: string, head = 8, tail = 6) {
  return value.length > head + tail + 1 ? `${value.slice(0, head)}…${value.slice(-tail)}` : value;
}

const dayFormat = new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", year: "numeric" });
const timeFormat = new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
export const day = (value: string | Date) => dayFormat.format(new Date(value));
export const dayTime = (value: string | Date) => timeFormat.format(new Date(value));

export function fiat(amount: string | number | null, currency: string | null) {
  if (amount === null || amount === "") return null;
  return `${amount} ${currency || "CAD"}`;
}

export const txUrl = (hash: string) => `${EXPLORER_URL}/tx/${hash}`;
