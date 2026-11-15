import { cache } from "react";
import { qatomReceiptColumns, type QatomReceipt } from "@/lib/qatom";
import { requireSide } from "@/lib/session";

const none = Promise.resolve({ data: [], error: null });

/** Everything the employer platform lists, loaded once per request. */
export const loadEmployer = cache(async () => {
  const session = await requireSide("employer");
  if (!session.ok) return { ok: false as const, title: "Could not verify your account", message: session.message };
  const { supabase, user, profile } = session;

  const { data: bounties, error } = await supabase.from("bounties")
    .select("id,title,status,max_budget_base_units,asset_symbol,display_fiat_amount,display_fiat_currency,deadline,created_at,funding_tx_hash")
    .eq("requester_id", user.id).order("created_at", { ascending: false });
  if (error) return { ok: false as const, title: "Could not load your bounties", message: error.message };

  const rows = bounties || [];
  const ids = rows.map((row) => row.id);
  const [submissionResult, paymentResult, matchResult, receiptResult] = await Promise.all([
    ids.length ? supabase.from("submissions").select("id,bounty_id,submitted_at").in("bounty_id", ids).order("submitted_at", { ascending: false }) : none,
    ids.length ? supabase.from("payments").select("id,bounty_id,kind,status,amount_base_units,tx_hash,explorer_url,created_at").in("bounty_id", ids).order("created_at", { ascending: false }) : none,
    ids.length ? supabase.from("bounty_matches").select("id,bounty_id,notification_status").in("bounty_id", ids) : none,
    ids.length ? supabase.from("qatom_receipts").select(qatomReceiptColumns).in("bounty_id", ids).order("occurred_at", { ascending: false }).limit(20) : none,
  ]);
  const issue = submissionResult.error || paymentResult.error || matchResult.error || receiptResult.error;
  if (issue) return { ok: false as const, title: "Some records could not be loaded", message: issue.message };

  const submissions = (submissionResult.data || []) as { id: string; bounty_id: string; submitted_at: string }[];
  const payments = (paymentResult.data || []) as { id: string; bounty_id: string; kind: string; status: string; amount_base_units: string | number; tx_hash: string | null; explorer_url: string | null; created_at: string }[];
  const matches = (matchResult.data || []) as { id: string; bounty_id: string; notification_status: string }[];
  const receipts = (receiptResult.data || []) as QatomReceipt[];

  const submissionCounts: Record<string, number> = {};
  for (const item of submissions) submissionCounts[item.bounty_id] = (submissionCounts[item.bounty_id] || 0) + 1;
  const matchCounts: Record<string, number> = {};
  for (const item of matches) matchCounts[item.bounty_id] = (matchCounts[item.bounty_id] || 0) + 1;
  const fundedBaseUnits = payments.filter((item) => item.kind === "funding" && item.status === "confirmed").reduce((sum, item) => sum + BigInt(item.amount_base_units), BigInt(0));
  const titles = new Map(rows.map((row) => [row.id as string, row.title as string]));

  return { ok: true as const, user, profile, bounties: rows, submissions, payments, receipts, submissionCounts, matchCounts, fundedBaseUnits, titles };
});
