"use client";
import { useState } from "react";
import { baseUnits, fromBaseUnits, NATIVE_SYMBOL, toBaseUnits } from "@/lib/format";

/**
 * Amount entry in BTC. The form receives exact integer base units under `name`,
 * which is what the database and the escrow contract expect.
 */
export function AmountField({ name, label, hint, defaultBase, allowZero = false, placeholder = "0.0001" }: {
  name: string; label: string; hint?: string; defaultBase?: string | number; allowZero?: boolean; placeholder?: string;
}) {
  const [text, setText] = useState(defaultBase === undefined ? "" : fromBaseUnits(defaultBase));
  const base = toBaseUnits(text);
  const valid = base !== null && (allowZero || base !== "0");
  return <label className="label">{label}
    <span className="relative block">
      <input className="field num pr-14" inputMode="decimal" autoComplete="off" required value={text} placeholder={placeholder}
        pattern="[0-9]+(\.[0-9]{1,18})?" aria-invalid={text !== "" && !valid}
        onChange={(event) => setText(event.target.value)} />
      <span className="pointer-events-none absolute inset-y-0 right-3 mt-[6px] flex items-center text-[13px] text-dim">{NATIVE_SYMBOL}</span>
    </span>
    <input type="hidden" name={name} value={valid ? base : ""} />
    <span className="hint">{text === "" ? hint : valid ? <>Exactly <span className="num">{baseUnits(base)}</span> base units.{hint ? ` ${hint}` : ""}</> : allowZero ? "Enter a number with up to 18 decimal places." : "Enter a number greater than zero, with up to 18 decimal places."}</span>
  </label>;
}
