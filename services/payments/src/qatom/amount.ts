/** USD-TDN amounts are exact thousandths held in bigint; they never pass through floating point. */
const AMOUNT = /^(0|[1-9][0-9]{0,14})(\.[0-9]{1,3})?$/;

export function parseUsdTdn(value: string): bigint {
  if (typeof value !== "string" || !AMOUNT.test(value)) {
    throw new Error("USD-TDN amount must be a decimal string with at most three decimal places");
  }
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, "0"));
}

export function formatUsdTdn(thousandths: bigint): string {
  if (thousandths < 0n) throw new Error("USD-TDN amount cannot be negative");
  return `${thousandths / 1000n}.${(thousandths % 1000n).toString().padStart(3, "0")}`;
}
