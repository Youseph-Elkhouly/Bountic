/** Parse exact native-asset base units; never parse/display fiat as an amount. */
export function parseBaseUnits(value: string): bigint {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error("Amount must be an unsigned integer string in native base units");
  }
  const parsed = BigInt(value);
  if (parsed <= 0n) throw new Error("Amount must be greater than zero");
  return parsed;
}

export function parseBountyId(value: string): bigint {
  if (!/^[1-9][0-9]*$/.test(value)) throw new Error("Bounty ID must be a positive integer string");
  return BigInt(value);
}
