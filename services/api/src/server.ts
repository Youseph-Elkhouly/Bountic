import { createClient } from "@supabase/supabase-js";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { z } from "zod";
import { env, assertServerConfig } from "./env.js";
import { admin, authenticate, canAct, recordAudit } from "./supabase.js";
import { agentSchema, autopilotColumns, bountySchema, qatomReceiptSchema, roleSchema, submissionSchema } from "./schemas.js";
import { planQatomReceiptWrite, qatomReceiptRow } from "./qatom.js";
import { payments, requestMatches } from "./integrations.js";
import { persistEligibleMatches } from "./matching.js";
import { telegram } from "./telegram.js";
import { agentExecutor, hashRunnerKey, isAllowedAgentEndpoint, looksLikeRunnerKey, maybeStartAgentWorker, newRunnerKey, nextLocalJob, platformCut, runStore, submitLocalRun, tickAgent, tickAll } from "./agents/index.js";
import { hashLinkToken, isAllowedSubmissionUpload, isSafeExternalUrl, randomLinkToken, verifySharedSecret, verifyWalletSignature } from "@bountiq/security";

const AGENT_PUBLIC_COLUMNS = "id,name,description,skills,categories,capabilities,min_reward_base_units,payout_wallet,available,wallet_verified_at,created_at,autonomy_enabled,runtime,model,instructions,webhook_url,max_concurrent_jobs,max_jobs_per_day,bid_percent,max_bid_base_units,max_tokens_per_job,tool_budget_usd_tdn,auto_submit,memory_enabled,web_search_enabled,backboard_assistant_id,runner_key_prefix,runner_last_seen_at";

type Variables = { userId: string; email: string };
const app = new Hono<{ Variables: Variables }>();
app.use("/api/submissions/upload", bodyLimit({ maxSize: 50 * 1024 * 1024 + 1024 * 1024 }));
app.use("/api/*", cors({ origin: env.webOrigin, allowHeaders: ["Authorization", "Content-Type"], allowMethods: ["GET", "POST", "PATCH", "OPTIONS"] }));

app.get("/health", (c) => c.json({ status: "ok" }));

app.use("/api/*", async (c, next) => {
  if (c.req.path === "/api/telegram/webhook") return next();
  const header = c.req.header("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return c.json({ error: "Authentication required" }, 401);
  const user = await authenticate(match[1]);
  if (!user) return c.json({ error: "Invalid or expired session" }, 401);
  c.set("userId", user.id);
  c.set("email", user.email || "");
  await next();
});

app.post("/api/profile/role", async (c) => {
  const parsed = roleSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Invalid role", details: parsed.error.issues }, 400);
  // Run as the authenticated user so the database RPC can bind auth.uid().
  const token = (c.req.header("authorization") || "").replace(/^Bearer\s+/i, "");
  const client = createClient(env.supabaseUrl, env.supabasePublishableKey, {
    auth: { autoRefreshToken: false, persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await client.rpc("choose_my_role", { next_role: parsed.data.role }).single();
  if (error) return c.json({ error: "Role is already selected or profile is unavailable" }, 409);
  await recordAudit(c.get("userId"), "role_selected", "profile", c.get("userId"), { role: parsed.data.role });
  return c.json({ profile: data });
});

app.get("/api/profile", async (c) => {
  const { data, error } = await admin.from("profiles").select("id,role,display_name,created_at").eq("id", c.get("userId")).single();
  if (error) return c.json({ error: "Profile not found" }, 404);
  return c.json({ profile: data });
});

app.post("/api/bounties", async (c) => {
  if (!(await canAct(c.get("userId"), "requester"))) return c.json({ error: "Requester role required" }, 403);
  const parsed = bountySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Invalid bounty", details: parsed.error.issues }, 400);
  const value = parsed.data;
  const { data, error } = await admin.from("bounties").insert({
    requester_id: c.get("userId"), title: value.title, description: value.description,
    category: value.category, required_skills: value.requiredSkills,
    deliverable_requirements: value.deliverableRequirements,
    max_budget_base_units: value.maxBudgetBaseUnits,
    display_fiat_amount: value.displayFiatAmount ?? null,
    display_fiat_currency: value.displayFiatCurrency ?? null,
    deadline: value.deadline, status: "draft",
  }).select("*").single();
  if (error) return c.json({ error: "Could not save bounty" }, 500);
  await recordAudit(c.get("userId"), "bounty_created", "bounty", data.id);
  return c.json({ bounty: data }, 201);
});

app.post("/api/bounties/:id/cancel", async (c) => {
  if (!(await canAct(c.get("userId"), "requester"))) return c.json({ error: "Requester role required" }, 403);
  const { data, error } = await admin.from("bounties").update({ status: "cancelled" })
    .eq("id", c.req.param("id")).eq("requester_id", c.get("userId")).eq("status", "draft")
    .select("id,status").maybeSingle();
  if (error) return c.json({ error: "Could not cancel bounty" }, 500);
  if (!data) return c.json({ error: "Only your unfunded draft bounties can be cancelled" }, 409);
  await recordAudit(c.get("userId"), "bounty_cancelled", "bounty", data.id);
  return c.json({ bounty: data });
});

app.get("/api/bounties", async (c) => {
  const userId = c.get("userId");
  const { data, error } = await admin.from("bounties").select("id,title,description,category,required_skills,deliverable_requirements,max_budget_base_units,asset_symbol,display_fiat_amount,display_fiat_currency,deadline,status,requester_id,created_at")
    .or(`status.eq.active,requester_id.eq.${userId}`).order("created_at", { ascending: false }).limit(100);
  if (error) return c.json({ error: "Could not load bounties" }, 500);
  return c.json({ bounties: data });
});

app.get("/api/bounties/:id", async (c) => {
  const { data, error } = await admin.from("bounties").select("*").eq("id", c.req.param("id")).maybeSingle();
  if (error || !data) return c.json({ error: "Bounty not found" }, 404);
  if (data.status !== "active" && data.requester_id !== c.get("userId")) return c.json({ error: "Bounty not found" }, 404);
  return c.json({ bounty: data });
});

app.post("/api/bounties/:id/funding-intent", async (c) => {
  if (!(await canAct(c.get("userId"), "requester"))) return c.json({ error: "Requester role required" }, 403);
  const { data: bounty } = await admin.from("bounties").select("*").eq("id", c.req.param("id")).eq("requester_id", c.get("userId")).maybeSingle();
  if (!bounty) return c.json({ error: "Bounty not found" }, 404);
  if (!["draft", "funding"].includes(bounty.status)) return c.json({ error: "Bounty is not in a fundable state" }, 409);
  const externalId = bounty.external_id || `0x${bounty.id.replaceAll("-", "")}`;
  try {
    const intent = await payments.prepareCreate({
      bountyId: bounty.id, externalId, budgetBaseUnits: String(bounty.max_budget_base_units),
      deadline: Math.floor(new Date(bounty.deadline).getTime() / 1000), requesterId: c.get("userId"),
    });
    if (bounty.status === "draft") {
      await admin.from("bounties").update({ status: "funding", external_id: externalId }).eq("id", bounty.id);
      await recordAudit(c.get("userId"), "funding_intent_created", "bounty", bounty.id);
    }
    return c.json({ bountyId: bounty.id, status: "funding", intent });
  } catch {
    return c.json({ error: "Payment preparation is unavailable; bounty funding state is unchanged" }, 503);
  }
});

app.post("/api/agents", async (c) => {
  if (!(await canAct(c.get("userId"), "earner"))) return c.json({ error: "Earner role required" }, 403);
  const parsed = agentSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Invalid agent", details: parsed.error.issues }, 400);
  const value = parsed.data;
  if (value.runtime === "webhook" && !isAllowedAgentEndpoint(value.webhookUrl)) return c.json({ error: "A webhook agent needs a public HTTPS endpoint" }, 400);
  const { data, error } = await admin.from("agents").insert({
    owner_id: c.get("userId"), name: value.name, description: value.description,
    skills: value.skills, categories: value.categories, capabilities: value.capabilities,
    min_reward_base_units: value.minRewardBaseUnits, payout_wallet: value.payoutWallet ?? null, available: value.available,
    ...autopilotColumns(value),
  }).select(AGENT_PUBLIC_COLUMNS).single();
  if (error) return c.json({ error: "Could not register agent" }, 500);
  await recordAudit(c.get("userId"), "agent_registered", "agent", data.id);
  return c.json({ agent: data, walletVerified: false }, 201);
});

app.get("/api/agents", async (c) => {
  const { data, error } = await admin.from("agents").select(AGENT_PUBLIC_COLUMNS).eq("owner_id", c.get("userId")).order("created_at", { ascending: false });
  if (error) return c.json({ error: "Could not load agents" }, 500);
  return c.json({ agents: data });
});

app.patch("/api/agents/:id", async (c) => {
  const raw = await c.req.json().catch(() => null) as Record<string, unknown> | null;
  const parsed = agentSchema.partial().safeParse(raw);
  if (!parsed.success || !raw || !Object.keys(raw).length) return c.json({ error: "Invalid agent update" }, 400);
  const value = parsed.data;
  // .partial() keeps schema defaults; only change availability when the caller actually sent it.
  if (!("available" in raw)) delete value.available;
  const update = {
    ...(value.name !== undefined ? { name: value.name } : {}),
    ...(value.description !== undefined ? { description: value.description } : {}),
    ...(value.skills !== undefined ? { skills: value.skills } : {}),
    ...(value.categories !== undefined ? { categories: value.categories } : {}),
    ...(value.capabilities !== undefined ? { capabilities: value.capabilities } : {}),
    ...(value.minRewardBaseUnits !== undefined ? { min_reward_base_units: value.minRewardBaseUnits } : {}),
    ...(value.payoutWallet !== undefined ? { payout_wallet: value.payoutWallet, wallet_verified_at: null } : {}),
    ...(value.available !== undefined ? { available: value.available } : {}),
    ...autopilotColumns(value),
  };
  if (value.webhookUrl && !isAllowedAgentEndpoint(value.webhookUrl)) return c.json({ error: "Webhook endpoint must be a public HTTPS address" }, 400);
  const { data, error } = await admin.from("agents").update(update).eq("id", c.req.param("id")).eq("owner_id", c.get("userId"))
    .select(AGENT_PUBLIC_COLUMNS).maybeSingle();
  if (error || !data) return c.json({ error: "Agent not found" }, 404);
  await recordAudit(c.get("userId"), "agent_updated", "agent", data.id);
  return c.json({ agent: data });
});

app.post("/api/agents/:id/wallet-challenge", async (c) => {
  const { data: agent } = await admin.from("agents").select("id,payout_wallet").eq("id", c.req.param("id")).eq("owner_id", c.get("userId")).maybeSingle();
  if (!agent) return c.json({ error: "Agent not found" }, 404);
  if (!agent.payout_wallet) return c.json({ error: "Add a payout address before verifying this wallet" }, 409);
  const nonce = randomLinkToken();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const message = `Bountiq payout wallet verification\nAgent: ${agent.id}\nWallet: ${agent.payout_wallet}\nNonce: ${nonce}\nExpires: ${expiresAt}`;
  const { error } = await admin.from("agent_wallet_challenges").insert({ agent_id: agent.id, user_id: c.get("userId"), wallet_address: agent.payout_wallet, nonce, message, expires_at: expiresAt });
  if (error) return c.json({ error: "Could not create wallet challenge" }, 500);
  return c.json({ message, expiresAt });
});

app.post("/api/agents/:id/verify-wallet", async (c) => {
  const body = await c.req.json().catch(() => null) as { message?: string; signature?: string } | null;
  if (!body?.message || !body.signature) return c.json({ error: "Message and signature required" }, 400);
  const { data: challenge } = await admin.from("agent_wallet_challenges").select("*").eq("agent_id", c.req.param("id")).eq("user_id", c.get("userId")).eq("message", body.message).is("used_at", null).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (!challenge) return c.json({ error: "Wallet challenge expired or already used" }, 409);
  if (!verifyWalletSignature(challenge.wallet_address, challenge.message, body.signature)) return c.json({ error: "Wallet signature does not match the registered payout address" }, 403);
  const now = new Date().toISOString();
  const { data: consumed, error } = await admin.from("agent_wallet_challenges").update({ used_at: now }).eq("id", challenge.id).is("used_at", null).select("id").maybeSingle();
  if (error || !consumed) return c.json({ error: "Wallet challenge expired or already used" }, 409);
  await admin.from("agents").update({ wallet_verified_at: now }).eq("id", challenge.agent_id).eq("owner_id", c.get("userId"));
  await recordAudit(c.get("userId"), "agent_wallet_verified", "agent", challenge.agent_id);
  return c.json({ verified: true, wallet: challenge.wallet_address });
});

app.post("/api/telegram/connect", async (c) => {
  if (!env.telegramBotUsername) return c.json({ error: "Telegram bot is not configured" }, 503);
  const token = randomLinkToken();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const { error } = await admin.from("telegram_connections").upsert({
    user_id: c.get("userId"), link_token_hash: hashLinkToken(token), link_expires_at: expiresAt,
    telegram_user_id: null, chat_id: null, verified_at: null,
  }, { onConflict: "user_id" });
  if (error) return c.json({ error: "Could not create Telegram link" }, 500);
  return c.json({ url: `https://t.me/${encodeURIComponent(env.telegramBotUsername)}?start=${encodeURIComponent(token)}`, expiresAt });
});

app.post("/api/bounties/:id/respond", async (c) => {
  if (!(await canAct(c.get("userId"), "earner"))) return c.json({ error: "Earner role required" }, 403);
  const body = await c.req.json().catch(() => null) as { agentId?: string; response?: string } | null;
  if (!body?.agentId || !z.string().uuid().safeParse(body.agentId).success || !["accepted", "declined"].includes(body.response || "")) return c.json({ error: "Valid agentId and response required" }, 400);
  const { data: agent } = await admin.from("agents").select("id").eq("id", body.agentId).eq("owner_id", c.get("userId")).maybeSingle();
  if (!agent) return c.json({ error: "Agent not found" }, 404);
  const { data: openBounty } = await admin.from("bounties").select("id").eq("id", c.req.param("id")).eq("status", "active").maybeSingle();
  if (!openBounty) return c.json({ error: "Bounty is no longer open" }, 409);
  const { data: match, error } = await admin.from("bounty_matches").update({ notification_status: body.response, response_at: new Date().toISOString() }).eq("bounty_id", c.req.param("id")).eq("agent_id", agent.id).eq("notification_status", "sent").select("id").maybeSingle();
  if (error || !match) return c.json({ error: "No pending invitation found" }, 404);
  return c.json({ status: body.response });
});

app.post("/api/submissions", async (c) => {
  const parsed = submissionSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Invalid submission", details: parsed.error.issues }, 400);
  const value = parsed.data;
  if (value.deliverableUrl && !isSafeExternalUrl(value.deliverableUrl)) return c.json({ error: "Deliverable URL must use a public HTTPS host" }, 400);
  const { data: agent } = await admin.from("agents").select("id,owner_id").eq("id", value.agentId).maybeSingle();
  if (!agent || agent.owner_id !== c.get("userId")) return c.json({ error: "Agent not found" }, 404);
  const { data: bounty } = await admin.from("bounties").select("id,status,max_budget_base_units").eq("id", value.bountyId).maybeSingle();
  if (!bounty || bounty.status !== "active") return c.json({ error: "Bounty is not accepting submissions" }, 409);
  if (BigInt(value.proposedAmountBaseUnits) > BigInt(bounty.max_budget_base_units)) return c.json({ error: "Proposed payout exceeds funded maximum" }, 400);
  const { data: match } = await admin.from("bounty_matches").select("id,notification_status").eq("bounty_id", bounty.id).eq("agent_id", agent.id).maybeSingle();
  if (!match || match.notification_status !== "accepted") return c.json({ error: "Agent must be invited or accept this bounty first" }, 403);
  const { data, error } = await admin.from("submissions").insert({
    bounty_id: value.bountyId, agent_id: value.agentId, proposed_amount_base_units: value.proposedAmountBaseUnits,
    deliverable_type: value.deliverableType, deliverable_url: value.deliverableUrl ?? null,
    storage_path: null, description: value.description,
  }).select("*").single();
  if (error) return c.json({ error: "Could not save submission" }, 500);
  await recordAudit(c.get("userId"), "submission_created", "submission", data.id);
  return c.json({ submission: data }, 201);
});

app.post("/api/submissions/upload", async (c) => {
  const body = await c.req.parseBody();
  const file = body.file;
  const bountyId = String(body.bountyId || "");
  const agentId = String(body.agentId || "");
  const proposedAmount = String(body.proposedAmountBaseUnits || "");
  const description = String(body.description || "").slice(0, 8000);
  if (!(file instanceof File) || !z.string().uuid().safeParse(bountyId).success || !z.string().uuid().safeParse(agentId).success || !/^[1-9][0-9]{0,77}$/.test(proposedAmount)) return c.json({ error: "File, bounty, agent, and positive base-unit payout are required" }, 400);
  if (!isAllowedSubmissionUpload(file.type, file.size)) return c.json({ error: "File type or size is not allowed" }, 400);
  const { data: agent } = await admin.from("agents").select("id,owner_id").eq("id", agentId).maybeSingle();
  if (!agent || agent.owner_id !== c.get("userId")) return c.json({ error: "Agent not found" }, 404);
  const { data: bounty } = await admin.from("bounties").select("id,status,max_budget_base_units").eq("id", bountyId).maybeSingle();
  if (!bounty || bounty.status !== "active") return c.json({ error: "Bounty is not accepting submissions" }, 409);
  if (BigInt(proposedAmount) > BigInt(bounty.max_budget_base_units)) return c.json({ error: "Payout exceeds funded maximum" }, 400);
  const { data: match } = await admin.from("bounty_matches").select("id,notification_status").eq("bounty_id", bountyId).eq("agent_id", agentId).maybeSingle();
  if (match?.notification_status !== "accepted") return c.json({ error: "Accept the bounty invite before submitting" }, 403);
  const bytes = Buffer.from(await file.arrayBuffer());
  if (!isAllowedSubmissionUpload(file.type, bytes.byteLength)) return c.json({ error: "File size or type is not allowed" }, 400);
  const extension = file.type === "application/pdf" ? "pdf" : file.type.includes("zip") ? "zip" : file.type === "video/mp4" ? "mp4" : file.type.startsWith("image/") ? "img" : "txt";
  const storagePath = `${c.get("userId")}/${bountyId}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await admin.storage.from(env.submissionsBucket).upload(storagePath, bytes, { contentType: file.type, upsert: false });
  if (uploadError) return c.json({ error: "Could not store deliverable" }, 500);
  const { data: submission, error } = await admin.from("submissions").insert({ bounty_id: bountyId, agent_id: agentId, proposed_amount_base_units: proposedAmount, deliverable_type: "file", storage_path: storagePath, description }).select("id,bounty_id,agent_id,proposed_amount_base_units,submitted_at").single();
  if (error) { await admin.storage.from(env.submissionsBucket).remove([storagePath]); return c.json({ error: "Could not save submission" }, 500); }
  await recordAudit(c.get("userId"), "submission_uploaded", "submission", submission.id);
  return c.json({ submission }, 201);
});

app.get("/api/bounties/:id/submissions", async (c) => {
  const { data: bounty } = await admin.from("bounties").select("requester_id").eq("id", c.req.param("id")).maybeSingle();
  if (!bounty || bounty.requester_id !== c.get("userId")) return c.json({ error: "Bounty not found" }, 404);
  const { data, error } = await admin.from("submissions").select("id,bounty_id,agent_id,proposed_amount_base_units,deliverable_type,deliverable_url,storage_path,description,submitted_at,agents(name,skills,payout_wallet,wallet_verified_at,runtime)").eq("bounty_id", c.req.param("id")).order("submitted_at", { ascending: false });
  if (error) return c.json({ error: "Could not load submissions" }, 500);
  const rows = await Promise.all((data ?? []).map(async (submission) => {
    if (!submission.storage_path) return submission;
    const { data: signed } = await admin.storage.from(env.submissionsBucket).createSignedUrl(submission.storage_path, 300);
    return { ...submission, signedDownloadUrl: signed?.signedUrl ?? null };
  }));
  return c.json({ submissions: rows });
});

app.post("/api/bounties/:id/select-winner", async (c) => {
  if (!(await canAct(c.get("userId"), "requester"))) return c.json({ error: "Requester role required" }, 403);
  const body = await c.req.json().catch(() => null) as { submissionId?: string } | null;
  if (!body?.submissionId || !z.string().uuid().safeParse(body.submissionId).success) return c.json({ error: "Valid submissionId required" }, 400);
  const { data: authorization, error } = await admin.rpc("authorize_bounty_winner", {
    target_bounty: c.req.param("id"), target_submission: body.submissionId, actor: c.get("userId"),
  }).single();
  if (error || !authorization || typeof (authorization as { id?: unknown }).id !== "string") return c.json({ error: "Requester, submission, verified wallet, or payout is not eligible" }, 409);
  const authorizationId = (authorization as { id: string }).id;
  await recordAudit(c.get("userId"), "winner_selected", "submission", body.submissionId, { bountyId: c.req.param("id"), authorizationId });
  try {
    // Recipient and amount come only from the immutable server-side authorization row.
    const intent = await payments.approveSettlement({ authorizationId, bountyId: c.req.param("id"), submissionId: body.submissionId, requesterId: c.get("userId") });
    return c.json({ status: "settlement_pending_requester_signature", authorizationId, intent });
  } catch {
    return c.json({ error: "Winner recorded; payment service approval adapter is unavailable", status: "settlement_pending", authorizationId }, 503);
  }
});


app.post("/api/bounties/:id/settlement-confirm", async (c) => {
  if (!(await canAct(c.get("userId"), "requester"))) return c.json({ error: "Requester role required" }, 403);
  const body = await c.req.json().catch(() => null) as { txHash?: string; authorizationId?: string } | null;
  if (!body?.txHash || !/^0x[0-9a-fA-F]{64}$/.test(body.txHash) || !body.authorizationId || !z.string().uuid().safeParse(body.authorizationId).success) return c.json({ error: "Invalid settlement approval receipt" }, 400);
  const { data: authorization } = await admin.from("settlement_authorizations").select("id,bounty_id,requester_id").eq("id", body.authorizationId).eq("bounty_id", c.req.param("id")).eq("requester_id", c.get("userId")).maybeSingle();
  if (!authorization) return c.json({ error: "Settlement authorization not found" }, 404);
  let confirmation: { status?: string; txHash?: string; blockNumber?: number; explorerUrl?: string };
  try { confirmation = await payments.confirm({ bountyId: authorization.bounty_id, txHash: body.txHash, expectedEvent: "SettlementApproved", authorizationId: authorization.id }) as typeof confirmation; }
  catch { return c.json({ error: "Payment service could not confirm settlement approval" }, 503); }
  if (confirmation?.status !== "confirmed" || confirmation?.txHash?.toLowerCase() !== body.txHash.toLowerCase()) return c.json({ error: "Settlement approval is not confirmed" }, 409);
  const { data: authRow } = await admin.from("settlement_authorizations").select("payout_amount_base_units,submission_id").eq("id", authorization.id).single();
  await admin.from("payments").upsert({ bounty_id: authorization.bounty_id, kind: "settlement", status: "pending", amount_base_units: authRow?.payout_amount_base_units, tx_hash: body.txHash, block_number: confirmation.blockNumber, explorer_url: confirmation.explorerUrl, submission_id: authRow?.submission_id, confirmed_at: new Date().toISOString() }, { onConflict: "tx_hash" });
  try {
    const intent = await payments.prepareSettlementExecution({ bountyId: authorization.bounty_id, authorizationId: authorization.id, requesterId: c.get("userId") });
    return c.json({ status: "settlement_approved", intent });
  } catch { return c.json({ error: "Settlement approved; execution transaction is unavailable", status: "settlement_approved" }, 503); }
});

app.post("/api/bounties/:id/settlement-finalize", async (c) => {
  if (!(await canAct(c.get("userId"), "requester"))) return c.json({ error: "Requester role required" }, 403);
  const body = await c.req.json().catch(() => null) as { txHash?: string; authorizationId?: string } | null;
  if (!body?.txHash || !/^0x[0-9a-fA-F]{64}$/.test(body.txHash) || !body.authorizationId || !z.string().uuid().safeParse(body.authorizationId).success) return c.json({ error: "Invalid settlement receipt" }, 400);
  const { data: authorization } = await admin.from("settlement_authorizations").select("id,bounty_id,requester_id,submission_id,payout_amount_base_units").eq("id", body.authorizationId).eq("bounty_id", c.req.param("id")).eq("requester_id", c.get("userId")).maybeSingle();
  if (!authorization) return c.json({ error: "Settlement authorization not found" }, 404);
  let confirmation: { status?: string; txHash?: string; blockNumber?: number; explorerUrl?: string };
  try { confirmation = await payments.confirm({ bountyId: authorization.bounty_id, txHash: body.txHash, expectedEvent: "BountySettled", authorizationId: authorization.id }) as typeof confirmation; }
  catch { return c.json({ error: "Payment service could not confirm settlement" }, 503); }
  if (confirmation?.status !== "confirmed" || confirmation?.txHash?.toLowerCase() !== body.txHash.toLowerCase()) return c.json({ error: "Settlement transaction is not confirmed" }, 409);
  const { error } = await admin.from("bounties").update({ status: "settled" }).eq("id", authorization.bounty_id).eq("requester_id", c.get("userId"));
  if (error) return c.json({ error: "Could not record settlement" }, 500);
  await admin.from("payments").upsert({ bounty_id: authorization.bounty_id, kind: "settlement", status: "confirmed", amount_base_units: authorization.payout_amount_base_units, tx_hash: body.txHash, block_number: confirmation.blockNumber, explorer_url: confirmation.explorerUrl, submission_id: authorization.submission_id, confirmed_at: new Date().toISOString() }, { onConflict: "tx_hash" });
  await recordAudit(c.get("userId"), "settlement_confirmed", "bounty", authorization.bounty_id, { txHash: body.txHash, submissionId: authorization.submission_id });
  return c.json({ status: "settled", explorerUrl: confirmation.explorerUrl });
});

app.post("/api/bounties/:id/refund-intent", async (c) => {
  if (!(await canAct(c.get("userId"), "requester"))) return c.json({ error: "Requester role required" }, 403);
  const { data: bounty } = await admin.from("bounties").select("id,status,deadline,onchain_bounty_id,requester_id").eq("id", c.req.param("id")).eq("requester_id", c.get("userId")).maybeSingle();
  if (!bounty || bounty.status !== "active" || new Date(bounty.deadline) >= new Date()) return c.json({ error: "Bounty is not eligible for an expiry refund" }, 409);
  const { data: authorization } = await admin.from("settlement_authorizations").select("id").eq("bounty_id", bounty.id).maybeSingle();
  if (authorization) return c.json({ error: "A settlement is already authorized" }, 409);
  try {
    const intent = await payments.prepareRefund({ bountyId: bounty.id, onchainBountyId: String(bounty.onchain_bounty_id), requesterId: c.get("userId") });
    return c.json({ status: "refund_pending_requester_signature", intent });
  } catch { return c.json({ error: "Payment service refund adapter is unavailable" }, 503); }
});

app.post("/api/bounties/:id/refund-confirm", async (c) => {
  if (!(await canAct(c.get("userId"), "requester"))) return c.json({ error: "Requester role required" }, 403);
  const body = await c.req.json().catch(() => null) as { txHash?: string } | null;
  if (!body?.txHash || !/^0x[0-9a-fA-F]{64}$/.test(body.txHash)) return c.json({ error: "Invalid refund receipt" }, 400);
  const { data: bounty } = await admin.from("bounties").select("*").eq("id", c.req.param("id")).eq("requester_id", c.get("userId")).eq("status", "active").maybeSingle();
  if (!bounty) return c.json({ error: "Refundable bounty not found" }, 404);
  let confirmation: { status?: string; txHash?: string; blockNumber?: number; explorerUrl?: string };
  try { confirmation = await payments.confirm({ bountyId: bounty.id, txHash: body.txHash, expectedEvent: "BountyRefunded" }) as typeof confirmation; }
  catch { return c.json({ error: "Payment service could not confirm refund" }, 503); }
  if (confirmation?.status !== "confirmed" || confirmation?.txHash?.toLowerCase() !== body.txHash.toLowerCase()) return c.json({ error: "Refund transaction is not confirmed" }, 409);
  const { error } = await admin.from("bounties").update({ status: "refunded" }).eq("id", bounty.id).eq("requester_id", c.get("userId"));
  if (error) return c.json({ error: "Could not record refund" }, 500);
  await admin.from("payments").upsert({ bounty_id: bounty.id, kind: "refund", status: "confirmed", amount_base_units: bounty.max_budget_base_units, tx_hash: body.txHash, block_number: confirmation.blockNumber, explorer_url: confirmation.explorerUrl, confirmed_at: new Date().toISOString() }, { onConflict: "tx_hash" });
  await recordAudit(c.get("userId"), "refund_confirmed", "bounty", bounty.id, { txHash: body.txHash });
  return c.json({ status: "refunded", explorerUrl: confirmation.explorerUrl });
});

app.get("/api/payments/:bountyId", async (c) => {
  const { data: bounty } = await admin.from("bounties").select("id,requester_id").eq("id", c.req.param("bountyId")).maybeSingle();
  if (!bounty) return c.json({ error: "Bounty not found" }, 404);
  const owns = bounty.requester_id === c.get("userId");
  if (!owns) {
    const { data: agent } = await admin.from("agents").select("id").eq("owner_id", c.get("userId"));
    const ids = (agent ?? []).map((row) => row.id);
    const { data: submission } = ids.length ? await admin.from("submissions").select("id").eq("bounty_id", bounty.id).in("agent_id", ids).limit(1).maybeSingle() : { data: null };
    if (!submission) return c.json({ error: "Payment not found" }, 404);
  }
  const { data, error } = await admin.from("payments").select("id,kind,status,amount_base_units,tx_hash,block_number,explorer_url,submission_id,confirmed_at,created_at").eq("bounty_id", bounty.id).order("created_at", { ascending: false });
  if (error) return c.json({ error: "Could not load payments" }, 500);
  return c.json({ payments: data });
});

app.post("/api/telegram/webhook", async (c) => {
  if (!verifySharedSecret(c.req.header("x-telegram-bot-api-secret-token"), env.telegramWebhookSecret)) return c.json({ error: "Invalid webhook secret" }, 401);
  const update = await c.req.json().catch(() => null) as Record<string, any> | null;
  const updateId = update?.update_id;
  if (!update || !Number.isSafeInteger(updateId)) return c.json({ error: "Invalid update" }, 400);
  const { error: insertError } = await admin.from("telegram_events").insert({ update_id: updateId, status: "processing" });
  if (insertError?.code === "23505") {
    const { data: existing } = await admin.from("telegram_events").select("status").eq("update_id", updateId).maybeSingle();
    if (existing?.status !== "failed") return c.json({ ok: true, duplicate: true });
    const { data: retry } = await admin.from("telegram_events").update({ status: "processing" }).eq("update_id", updateId).eq("status", "failed").select("update_id").maybeSingle();
    if (!retry) return c.json({ ok: true, duplicate: true });
  } else if (insertError) return c.json({ error: "Could not record update" }, 500);
  try {
    const msg = update.message;
    const chatId = msg?.chat?.id;
    const fromId = msg?.from?.id;
    const text = String(msg?.text || "");
    if (chatId && fromId && text.startsWith("/start ")) {
      const token = text.slice(7).trim();
      const { data: connection } = await admin.from("telegram_connections").select("id,link_expires_at").eq("link_token_hash", hashLinkToken(token)).maybeSingle();
      if (connection && new Date(connection.link_expires_at) > new Date()) {
        await admin.from("telegram_connections").update({ telegram_user_id: fromId, chat_id: chatId, verified_at: new Date().toISOString(), link_token_hash: null, link_expires_at: null }).eq("id", connection.id);
        await telegram("sendMessage", { chat_id: chatId, text: "Your Telegram account is linked to Bountiq." });
      }
    } else if (update.callback_query) {
      const callback = update.callback_query;
      const match = String(callback.data || "").match(/^match:([0-9a-f-]{36}):(accept|decline)$/i);
      if (match && callback.message?.chat?.id && callback.from?.id) {
        const { data: connection } = await admin.from("telegram_connections").select("user_id,telegram_user_id").eq("chat_id", callback.message.chat.id).not("verified_at", "is", null).maybeSingle();
        if (connection && connection.telegram_user_id === callback.from.id) {
          const { data: row } = await admin.from("bounty_matches").select("id,agent_id").eq("id", match[1]).maybeSingle();
          const { data: matchedAgent } = row ? await admin.from("agents").select("owner_id").eq("id", row.agent_id).maybeSingle() : { data: null };
          if (row && matchedAgent?.owner_id === connection.user_id) await admin.from("bounty_matches").update({ notification_status: match[2] === "accept" ? "accepted" : "declined", response_at: new Date().toISOString() }).eq("id", row.id);
        }
        await telegram("answerCallbackQuery", { callback_query_id: callback.id });
      }
    } else if (msg && fromId && chatId && text.startsWith("/submit ")) {
      const parts = text.trim().split(/\s+/, 5);
      const [, agentId, bountyId, amount, deliverable = ""] = parts;
      const { data: connection } = await admin.from("telegram_connections").select("user_id,telegram_user_id").eq("chat_id", chatId).not("verified_at", "is", null).maybeSingle();
      if (!connection || connection.telegram_user_id !== fromId || !agentId || !bountyId || !amount || !/^[1-9][0-9]{0,77}$/.test(amount)) {
        await telegram("sendMessage", { chat_id: chatId, text: "Submission not accepted. Check the format and ensure this Telegram account is linked." });
      } else {
        const { data: agent } = await admin.from("agents").select("id,owner_id").eq("id", agentId).eq("owner_id", connection.user_id).maybeSingle();
        const { data: bounty } = await admin.from("bounties").select("id,status,max_budget_base_units").eq("id", bountyId).eq("status", "active").maybeSingle();
        const { data: invited } = agent && bounty ? await admin.from("bounty_matches").select("id,notification_status").eq("agent_id", agent.id).eq("bounty_id", bounty.id).maybeSingle() : { data: null };
        if (!agent || !bounty || invited?.notification_status !== "accepted" || BigInt(amount) > BigInt(bounty.max_budget_base_units)) {
          await telegram("sendMessage", { chat_id: chatId, text: "Submission not accepted. Agent must own this account, accept the invite, and stay within the funded budget." });
        } else {
          let storagePath: string | null = null;
          let deliverableUrl: string | null = null;
          let deliverableType = "text";
          const file = msg.document || msg.video || (Array.isArray(msg.photo) ? msg.photo[msg.photo.length - 1] : null);
          if (file?.file_id) {
            const fileInfo = await telegram("getFile", { file_id: file.file_id }) as { file_path?: string; file_size?: number };
            const response = fileInfo.file_path ? await fetch(`https://api.telegram.org/file/bot${env.telegramBotToken}/${fileInfo.file_path}`, { signal: AbortSignal.timeout(20000) }) : null;
            const maxBytes = 50 * 1024 * 1024;
            if (!response?.ok || (fileInfo.file_size ?? 0) > maxBytes || Number(response.headers.get("content-length") || 0) > maxBytes || !response.body) throw new Error("Telegram file could not be retrieved within limits");
            const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let total = 0;
            while (true) {
              const part = await reader.read();
              if (part.done) break;
              total += part.value.byteLength;
              if (total > maxBytes) { await reader.cancel(); throw new Error("Telegram file exceeds the upload limit"); }
              chunks.push(part.value);
            }
            const bytes = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total);
            const mime = String(file.mime_type || (msg.photo ? "image/jpeg" : msg.video ? "video/mp4" : "application/octet-stream"));
            if (!isAllowedSubmissionUpload(mime, bytes.byteLength)) throw new Error("File type or size is not allowed");
            const ext = mime === "application/pdf" ? "pdf" : mime.includes("zip") ? "zip" : mime === "video/mp4" ? "mp4" : mime.startsWith("image/") ? "img" : "txt";
            storagePath = `${connection.user_id}/${bounty.id}/${crypto.randomUUID()}.${ext}`;
            const { error: uploadError } = await admin.storage.from(env.submissionsBucket).upload(storagePath, bytes, { contentType: mime, upsert: false });
            if (uploadError) throw uploadError;
            deliverableType = "file";
          } else if (deliverable) {
            if (!isSafeExternalUrl(deliverable)) throw new Error("Submission links must use public HTTPS URLs");
            deliverableUrl = deliverable;
            deliverableType = "external_link";
          }
          const { error: submissionError } = await admin.from("submissions").insert({ bounty_id: bounty.id, agent_id: agent.id, proposed_amount_base_units: amount, deliverable_type: deliverableType, deliverable_url: deliverableUrl, storage_path: storagePath, description: String(msg.caption || "Submitted through Telegram").slice(0, 8000), telegram_update_id: updateId });
          if (submissionError && submissionError.code !== "23505") throw submissionError;
          await telegram("sendMessage", { chat_id: chatId, text: `Submission received for bounty ${bounty.id}.` });
        }
      }
    }
    await admin.from("telegram_events").update({ status: "processed", processed_at: new Date().toISOString() }).eq("update_id", updateId);
    return c.json({ ok: true });
  } catch {
    await admin.from("telegram_events").update({ status: "failed" }).eq("update_id", updateId);
    return c.json({ error: "Update processing failed" }, 500);
  }
});

app.post("/api/bounties/:id/funding-ready", async (c) => {
  if (!(await canAct(c.get("userId"), "requester"))) return c.json({ error: "Requester role required" }, 403);
  const body = await c.req.json().catch(() => null) as { txHash?: string } | null;
  if (!body?.txHash || !/^0x[0-9a-fA-F]{64}$/.test(body.txHash)) return c.json({ error: "Invalid create transaction hash" }, 400);
  const { data: bounty } = await admin.from("bounties").select("*").eq("id", c.req.param("id")).eq("requester_id", c.get("userId")).eq("status", "funding").maybeSingle();
  if (!bounty) return c.json({ error: "Funding bounty not found" }, 404);
  try {
    const created = await payments.confirmCreate({ bountyId: bounty.id, externalId: bounty.external_id, txHash: body.txHash });
    if (created?.status !== "confirmed" || !/^\d+$/.test(String(created.onchainBountyId))) return c.json({ error: "Create transaction is not confirmed" }, 409);
    const intent = await payments.prepareFund({ bountyId: bounty.id, onchainBountyId: String(created.onchainBountyId), amountBaseUnits: String(bounty.max_budget_base_units), requesterId: c.get("userId") });
    return c.json({ onchainBountyId: String(created.onchainBountyId), transaction: intent?.transaction, explorerUrl: created.explorerUrl });
  } catch {
    return c.json({ error: "Payment service could not prepare the funding transaction" }, 503);
  }
});

app.post("/api/bounties/:id/funding-confirm", async (c) => {
  if (!(await canAct(c.get("userId"), "requester"))) return c.json({ error: "Requester role required" }, 403);
  const body = await c.req.json().catch(() => null) as { txHash?: string; onchainBountyId?: string } | null;
  if (!body?.txHash || !/^0x[0-9a-fA-F]{64}$/.test(body.txHash) || !body.onchainBountyId || !/^\d+$/.test(body.onchainBountyId)) return c.json({ error: "Invalid funding receipt" }, 400);
  const { data: bounty } = await admin.from("bounties").select("*").eq("id", c.req.param("id")).eq("requester_id", c.get("userId")).eq("status", "funding").maybeSingle();
  if (!bounty) return c.json({ error: "Funding bounty not found" }, 404);
  let confirmation: { status?: string; txHash?: string; onchainBountyId?: string; blockNumber?: number; explorerUrl?: string };
  try { confirmation = await payments.confirmFunding({ bountyId: bounty.id, onchainBountyId: body.onchainBountyId, txHash: body.txHash, expectedEvent: "BountyFunded" }); }
  catch { return c.json({ error: "Payment service could not confirm funding" }, 503); }
  if (confirmation?.status !== "confirmed" || confirmation?.txHash?.toLowerCase() !== body.txHash.toLowerCase()) return c.json({ error: "Funding transaction is not confirmed" }, 409);
  const { error } = await admin.from("bounties").update({ status: "active", onchain_bounty_id: body.onchainBountyId, funding_tx_hash: body.txHash }).eq("id", bounty.id).eq("requester_id", c.get("userId"));
  if (error) return c.json({ error: "Could not activate bounty" }, 500);
  await admin.from("payments").upsert({ bounty_id: bounty.id, kind: "funding", status: "confirmed", amount_base_units: bounty.max_budget_base_units, tx_hash: body.txHash, block_number: confirmation.blockNumber, explorer_url: confirmation.explorerUrl, confirmed_at: new Date().toISOString() }, { onConflict: "tx_hash" });
  await recordAudit(c.get("userId"), "bounty_funded", "bounty", bounty.id, { txHash: body.txHash });
  try {
    const result = await requestMatches({ bountyId: bounty.id, title: bounty.title, description: bounty.description, category: bounty.category, requiredSkills: bounty.required_skills, budgetBaseUnits: String(bounty.max_budget_base_units), deadline: bounty.deadline });
    const matchCount = await persistEligibleMatches(bounty, result.matches);
    return c.json({ status: "active", matchSource: result.source, matchCount });
  } catch {
    return c.json({ status: "active", matchDispatch: "retry_required" }, 202);
  }
});

app.get("/internal/settlement-authorizations/:id", async (c) => {
  if (!env.internalWorkerToken || !verifySharedSecret(c.req.header("authorization")?.replace(/^Bearer\s+/i, ""), env.internalWorkerToken)) return c.json({ error: "Unauthorized" }, 401);
  const { data: authorization } = await admin.from("settlement_authorizations").select("*").eq("id", c.req.param("id")).maybeSingle();
  if (!authorization) return c.json({ error: "Authorization not found" }, 404);
  const { data: bounty } = await admin.from("bounties").select("status,onchain_bounty_id,max_budget_base_units,requester_id,funding_tx_hash").eq("id", authorization.bounty_id).maybeSingle();
  if (!bounty) return c.json({ error: "Bounty not found" }, 404);
  return c.json({ authorization, bounty });
});

app.post("/internal/bounties/:id/funded", async (c) => {
  if (!env.internalWorkerToken || !verifySharedSecret(c.req.header("authorization")?.replace(/^Bearer\s+/i, ""), env.internalWorkerToken)) return c.json({ error: "Unauthorized" }, 401);
  const body = await c.req.json().catch(() => null) as { txHash?: string; onchainBountyId?: string } | null;
  if (!body?.txHash || !/^0x[0-9a-fA-F]{64}$/.test(body.txHash) || !body.onchainBountyId || !/^\d+$/.test(body.onchainBountyId)) return c.json({ error: "Invalid funding confirmation" }, 400);
  const { data: bounty } = await admin.from("bounties").select("*").eq("id", c.req.param("id")).eq("status", "funding").maybeSingle();
  if (!bounty) return c.json({ error: "Funding bounty not found" }, 404);
  let confirmation: { status?: string; txHash?: string; onchainBountyId?: string; blockNumber?: number; explorerUrl?: string };
  try { confirmation = await payments.confirmFunding({ bountyId: bounty.id, onchainBountyId: body.onchainBountyId, txHash: body.txHash }); }
  catch { return c.json({ error: "Payment service could not confirm funding" }, 503); }
  if (confirmation?.status !== "confirmed" || confirmation?.txHash?.toLowerCase() !== body.txHash.toLowerCase()) return c.json({ error: "Funding transaction is not confirmed" }, 409);
  const { error } = await admin.from("bounties").update({ status: "active", onchain_bounty_id: body.onchainBountyId, funding_tx_hash: body.txHash }).eq("id", bounty.id);
  if (error) return c.json({ error: "Could not activate bounty" }, 500);
  await admin.from("payments").upsert({ bounty_id: bounty.id, kind: "funding", status: "confirmed", amount_base_units: bounty.max_budget_base_units, tx_hash: body.txHash, block_number: confirmation.blockNumber, explorer_url: confirmation.explorerUrl, confirmed_at: new Date().toISOString() }, { onConflict: "tx_hash" });
  await recordAudit(null, "bounty_funded", "bounty", bounty.id, { txHash: body.txHash });
  try {
    const result = await requestMatches({ bountyId: bounty.id, title: bounty.title, description: bounty.description, category: bounty.category, requiredSkills: bounty.required_skills, budgetBaseUnits: String(bounty.max_budget_base_units), deadline: bounty.deadline });
    const matchCount = await persistEligibleMatches(bounty, result.matches);
    return c.json({ status: "active", matchSource: result.source, matchCount });
  } catch {
    return c.json({ status: "active", matchDispatch: "retry_required" }, 202);
  }
});

app.post("/internal/notifications/dispatch", async (c) => {
  if (!env.internalWorkerToken || !verifySharedSecret(c.req.header("authorization")?.replace(/^Bearer\s+/i, ""), env.internalWorkerToken)) return c.json({ error: "Unauthorized" }, 401);
  const { data: jobs } = await admin.from("notification_jobs").select("id,attempts,bounty_match_id,bounty_matches(id,agent_id,bounties(id,title,description,deliverable_requirements,max_budget_base_units,deadline))").is("sent_at", null).lte("available_at", new Date().toISOString()).limit(20);
  let sent = 0;
  for (const job of jobs ?? []) {
    try {
      const match = Array.isArray(job.bounty_matches) ? job.bounty_matches[0] : job.bounty_matches;
      const bounty = match && (Array.isArray(match.bounties) ? match.bounties[0] : match.bounties);
      if (!match || !bounty) throw new Error("Notification target missing");
      const { data: agent } = await admin.from("agents").select("owner_id").eq("id", match.agent_id).eq("available", true).maybeSingle();
      if (!agent) throw new Error("Agent unavailable");
      const { data: connection } = await admin.from("telegram_connections").select("chat_id").eq("user_id", agent.owner_id).not("verified_at", "is", null).maybeSingle();
      if (!connection?.chat_id) throw new Error("Telegram account not linked");
      const deadline = new Date(bounty.deadline).toLocaleString("en-US", { timeZone: "UTC", timeZoneName: "short" });
      await telegram("sendMessage", {
        chat_id: connection.chat_id,
        text: `New Bountiq bounty: ${bounty.title}\n${bounty.description}\nRequirements: ${bounty.deliverable_requirements}\nMaximum: ${bounty.max_budget_base_units} native BTC base units\nDeadline: ${deadline}\nBounty ID: ${bounty.id}\nView: ${env.webOrigin}/bounties/${bounty.id}`,
        reply_markup: { inline_keyboard: [[{ text: "Accept", callback_data: `match:${match.id}:accept` }, { text: "Decline", callback_data: `match:${match.id}:decline` }]] },
      });
      await admin.from("bounty_matches").update({ notification_status: "sent", notified_at: new Date().toISOString() }).eq("id", match.id).in("notification_status", ["queued", "failed"]);
      await admin.from("notification_jobs").update({ sent_at: new Date().toISOString(), attempts: job.attempts + 1, last_error: null }).eq("id", job.id);
      sent++;
    } catch (error) {
      const attempts = job.attempts + 1;
      const delay = Math.min(60 * 60, 30 * 2 ** Math.min(attempts, 7));
      await admin.from("notification_jobs").update({ attempts, available_at: new Date(Date.now() + delay * 1000).toISOString(), last_error: String(error).slice(0, 500) }).eq("id", job.id);
      await admin.from("bounty_matches").update({ notification_status: "failed" }).eq("id", job.bounty_match_id);
    }
  }
  return c.json({ sent, considered: jobs?.length ?? 0 });
});

app.post("/internal/qatom/receipts", async (c) => {
  if (!env.internalWorkerToken || !verifySharedSecret(c.req.header("authorization")?.replace(/^Bearer\s+/i, ""), env.internalWorkerToken)) return c.json({ error: "Unauthorized" }, 401);
  const parsed = qatomReceiptSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Invalid Qatom receipt", details: parsed.error.issues }, 400);
  const input = parsed.data;
  const { data: agent } = await admin.from("agents").select("id").eq("id", input.agentId).maybeSingle();
  const { data: bounty } = await admin.from("bounties").select("id").eq("id", input.bountyId).maybeSingle();
  if (!agent || !bounty) return c.json({ error: "Bounty or agent not found" }, 404);
  const columns = "id,idempotency_key,bounty_id,agent_id,status,transaction_id,item_id,item_name,seller,amount_usd_tdn,approval_url,rejection_reason,occurred_at,created_at,updated_at";
  const { data: existing, error: lookupError } = await admin.from("qatom_receipts").select(columns).eq("idempotency_key", input.idempotencyKey).maybeSingle();
  if (lookupError) return c.json({ error: "Could not load Qatom receipt" }, 500);
  const plan = planQatomReceiptWrite(existing, input);
  if (plan === "conflict") return c.json({ error: "A different purchase is already recorded for this idempotency key", receipt: existing }, 409);
  if (plan === "duplicate") return c.json({ receipt: existing, duplicate: true });
  const row = qatomReceiptRow(input);
  const { data, error } = plan === "insert"
    ? await admin.from("qatom_receipts").insert(row).select(columns).single()
    : await admin.from("qatom_receipts").update(row).eq("id", existing!.id).eq("status", "pending_approval").select(columns).maybeSingle();
  if (error?.code === "23505") return c.json({ error: "Receipt was recorded concurrently or its transaction ID is already used; look it up before retrying" }, 409);
  if (error) return c.json({ error: "Could not record Qatom receipt" }, 500);
  if (!data) return c.json({ error: "Receipt changed while it was being recorded; look it up before retrying" }, 409);
  await recordAudit(null, `qatom_purchase_${input.status}`, "qatom_receipt", data.id, { bountyId: input.bountyId, agentId: input.agentId, amountUsdTdn: input.amountUsdTdn, transactionId: input.transactionId });
  return c.json({ receipt: data, duplicate: false }, plan === "insert" ? 201 : 200);
});

// ---------------------------------------------------------------------------
// Autonomous agents
// ---------------------------------------------------------------------------

const RUN_COLUMNS = "id,agent_id,bounty_id,status,match_score,bid_base_units,deliverable,submission_id,executor,tokens_used,error,started_at,finished_at,backboard_thread_id,bounties(title,status,max_budget_base_units,deadline)";

/** Live activity for every agent the caller owns (or one agent with ?agentId=). The dashboard polls this. */
app.get("/api/agent-activity", async (c) => {
  const agentId = c.req.query("agentId");
  let query = admin.from("agents").select("id,name,autonomy_enabled,available,max_concurrent_jobs,max_jobs_per_day").eq("owner_id", c.get("userId"));
  if (agentId) query = query.eq("id", agentId);
  const { data: agents, error } = await query;
  if (error) return c.json({ error: "Could not load agents" }, 500);
  const ids = (agents ?? []).map((agent) => agent.id);
  if (!ids.length) return c.json({ agents: [], runs: [], events: [] });
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [runs, events, today] = await Promise.all([
    admin.from("agent_runs").select(RUN_COLUMNS).in("agent_id", ids).order("started_at", { ascending: false }).limit(30),
    admin.from("agent_run_events").select("id,run_id,agent_id,kind,message,data,created_at").in("agent_id", ids).order("created_at", { ascending: false }).limit(60),
    admin.from("agent_runs").select("agent_id,status").in("agent_id", ids).gte("started_at", since),
  ]);
  if (runs.error || events.error || today.error) return c.json({ error: "Could not load agent activity" }, 500);
  const usage = new Map<string, { today: number; open: number }>();
  for (const row of today.data ?? []) {
    const entry = usage.get(row.agent_id) ?? { today: 0, open: 0 };
    if (row.status !== "skipped") entry.today++;
    if (row.status === "claimed" || row.status === "working") entry.open++;
    usage.set(row.agent_id, entry);
  }
  return c.json({
    agents: (agents ?? []).map((agent) => ({ ...agent, jobsToday: usage.get(agent.id)?.today ?? 0, openJobs: usage.get(agent.id)?.open ?? 0 })),
    runs: runs.data, events: events.data,
  });
});

/** LLMs available to hosted agents, from Backboard's model catalog (cached). */
const FALLBACK_MODELS = [
  { value: "auto", label: "Backboard default" },
  { value: "anthropic/claude-sonnet-4-20250514", label: "Claude Sonnet 4 (Anthropic)" },
  { value: "openai/gpt-4o", label: "GPT-4o (OpenAI)" },
];
let modelCache: { at: number; models: Array<{ value: string; label: string }> } | null = null;
app.get("/api/agent-models", async (c) => {
  if (!env.backboardApiKey) return c.json({ source: "fallback", backboard: false, models: FALLBACK_MODELS });
  if (modelCache && Date.now() - modelCache.at < 10 * 60 * 1000) return c.json({ source: "backboard", backboard: true, models: modelCache.models });
  try {
    const response = await fetch(`${env.backboardApiUrl.replace(/\/+$/, "")}/models?model_type=llm&limit=500`, { headers: { "X-API-Key": env.backboardApiKey }, signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(String(response.status));
    const data = await response.json() as unknown;
    const rows = (Array.isArray(data) ? data : Array.isArray((data as { models?: unknown }).models) ? (data as { models: unknown[] }).models : []) as Array<Record<string, unknown>>;
    const models = rows.map((row) => {
      const provider = String(row.provider ?? row.llm_provider ?? "").trim();
      const name = String(row.name ?? row.model_name ?? row.id ?? "").trim();
      return provider && name && /^[a-zA-Z0-9._:/-]{1,80}$/.test(`${provider}/${name}`) ? { value: `${provider}/${name}`, label: `${name} (${provider})` } : null;
    }).filter((item): item is { value: string; label: string } => Boolean(item)).slice(0, 400);
    if (!models.length) throw new Error("empty catalog");
    modelCache = { at: Date.now(), models: [{ value: "auto", label: "Backboard default" }, ...models] };
    return c.json({ source: "backboard", backboard: true, models: modelCache.models });
  } catch {
    return c.json({ source: "fallback", backboard: true, models: FALLBACK_MODELS });
  }
});

/** "Run now": one immediate scheduling pass for an agent, still bound by every limit. */
app.post("/api/agents/:id/run-now", async (c) => {
  const agent = await runStore.getAgent(c.req.param("id"));
  if (!agent || agent.owner_id !== c.get("userId")) return c.json({ error: "Agent not found" }, 404);
  if (!agent.available) return c.json({ error: "Agent is paused. Mark it available first." }, 409);
  const result = await tickAgent(runStore, agentExecutor, agent, { force: true });
  await recordAudit(c.get("userId"), "agent_run_now", "agent", agent.id, result);
  return c.json({ result });
});

/** Owner approves a draft held for review (auto-submit off, or autopilot switched off mid-task). */
app.post("/api/agent-runs/:id/submit", async (c) => {
  const { data: run } = await admin.from("agent_runs").select("id,agent_id,bounty_id,status,deliverable,bid_base_units,agents!inner(owner_id)").eq("id", c.req.param("id")).maybeSingle();
  const owner = (run?.agents as unknown as { owner_id: string } | null)?.owner_id;
  if (!run || owner !== c.get("userId")) return c.json({ error: "Run not found" }, 404);
  if (run.status !== "awaiting_review" || !run.deliverable || !run.bid_base_units) return c.json({ error: "This run has no draft waiting for review" }, 409);
  const bounty = await runStore.getBounty(run.bounty_id);
  if (!bounty || bounty.status !== "active" || new Date(bounty.deadline).getTime() <= Date.now()) return c.json({ error: "Bounty is no longer accepting submissions" }, 409);
  const { data: claimed } = await admin.from("agent_runs").update({ status: "submitted", finished_at: new Date().toISOString() }).eq("id", run.id).eq("status", "awaiting_review").select("id").maybeSingle();
  if (!claimed) return c.json({ error: "This draft was already handled" }, 409);
  const submission = await runStore.createSubmission({ bountyId: run.bounty_id, agentId: run.agent_id, proposedAmountBaseUnits: String(run.bid_base_units), deliverableType: "text", deliverableUrl: null, description: run.deliverable.slice(0, 8000) });
  await admin.from("agent_runs").update({ submission_id: submission.id }).eq("id", run.id);
  await runStore.logEvent({ agentId: run.agent_id, runId: run.id, kind: "submitted", message: `Owner approved the draft; submitted to "${bounty.title}".`, data: { bountyId: bounty.id, submissionId: submission.id } });
  await recordAudit(c.get("userId"), "agent_draft_approved", "agent_run", run.id, { submissionId: submission.id });
  return c.json({ submission });
});

/**
 * DEMO ONLY (DEMO_FUNDING_ENABLED=true): activates a bounty without on-chain escrow so agents
 * can pick it up while the payments integration is finished. Disabled by default; audited.
 */
app.post("/api/bounties/:id/demo-activate", async (c) => {
  if (!env.demoFundingEnabled) return c.json({ error: "Demo funding is disabled on this server" }, 404);
  if (!(await canAct(c.get("userId"), "requester"))) return c.json({ error: "Requester role required" }, 403);
  const { data: bounty } = await admin.from("bounties").update({ status: "active" }).eq("id", c.req.param("id")).eq("requester_id", c.get("userId")).in("status", ["draft", "funding"]).select("*").maybeSingle();
  if (!bounty) return c.json({ error: "Draft bounty not found" }, 404);
  await recordAudit(c.get("userId"), "bounty_demo_activated_without_escrow", "bounty", bounty.id);
  try {
    const result = await requestMatches({ bountyId: bounty.id, title: bounty.title, description: bounty.description, category: bounty.category, requiredSkills: bounty.required_skills, budgetBaseUnits: String(bounty.max_budget_base_units), deadline: bounty.deadline });
    const matchCount = await persistEligibleMatches(bounty, result.matches);
    return c.json({ status: "active", demo: true, matchSource: result.source, matchCount });
  } catch {
    return c.json({ status: "active", demo: true, matchDispatch: "retry_required" });
  }
});

/** Owner creates (or rotates) the key their own-hardware runner uses. Shown once; only a hash is stored. */
app.post("/api/agents/:id/runner-key", async (c) => {
  const key = newRunnerKey();
  const { data, error } = await admin.from("agents").update({ runner_key_hash: hashRunnerKey(key), runner_key_prefix: key.slice(0, 12), runner_last_seen_at: null })
    .eq("id", c.req.param("id")).eq("owner_id", c.get("userId")).select("id").maybeSingle();
  if (error || !data) return c.json({ error: "Agent not found" }, 404);
  await recordAudit(c.get("userId"), "agent_runner_key_rotated", "agent", data.id);
  return c.json({ key, prefix: key.slice(0, 12), note: "Store this key now; it cannot be shown again." });
});

/** Own-hardware runner API. Authenticated by the agent's runner key, not a user session. */
async function runnerAgent(c: { req: { header: (name: string) => string | undefined } }) {
  const token = (c.req.header("authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
  if (!looksLikeRunnerKey(token)) return null;
  const { data } = await admin.from("agents").select("id").eq("runner_key_hash", hashRunnerKey(token)).maybeSingle();
  if (!data) return null;
  await admin.from("agents").update({ runner_last_seen_at: new Date().toISOString() }).eq("id", data.id);
  return runStore.getAgent(data.id);
}

app.get("/runner/v1/me", async (c) => {
  const agent = await runnerAgent(c);
  if (!agent) return c.json({ error: "Invalid runner key" }, 401);
  return c.json({ agent: { id: agent.id, name: agent.name, runtime: agent.runtime, autonomyEnabled: agent.autonomy_enabled, available: agent.available } });
});

/** Claims the best eligible bounty (same limits and fit rules as hosted agents) or says why there is none. */
app.post("/runner/v1/next", async (c) => {
  const agent = await runnerAgent(c);
  if (!agent) return c.json({ error: "Invalid runner key" }, 401);
  const { job, reason } = await nextLocalJob(runStore, agent);
  return c.json({ job, reason });
});

app.post("/runner/v1/runs/:id/submit", async (c) => {
  const agent = await runnerAgent(c);
  if (!agent) return c.json({ error: "Invalid runner key" }, 401);
  const body = await c.req.json().catch(() => null) as { deliverable?: unknown } | null;
  if (typeof body?.deliverable !== "string") return c.json({ error: "deliverable (string) required" }, 400);
  const result = await submitLocalRun(runStore, agent, c.req.param("id"), body.deliverable);
  return result.ok ? c.json({ submissionId: result.submissionId || null, held: result.held }) : c.json({ error: result.error }, result.status as 400 | 404 | 409);
});

/**
 * DEMO ONLY (DEMO_FUNDING_ENABLED=true): picks the winner and records a SIMULATED payout (no on-chain tx)
 * with the platform cut: SERVICE_FEE_BPS (2.5%) on every payout, plus HOSTED_FEE_BPS (10%) when Bountic hosts the agent.
 */
app.post("/api/bounties/:id/demo-settle", async (c) => {
  if (!env.demoFundingEnabled) return c.json({ error: "Demo funding is disabled on this server" }, 404);
  if (!(await canAct(c.get("userId"), "requester"))) return c.json({ error: "Requester role required" }, 403);
  const body = await c.req.json().catch(() => null) as { submissionId?: string } | null;
  if (!body?.submissionId || !z.string().uuid().safeParse(body.submissionId).success) return c.json({ error: "Valid submissionId required" }, 400);
  const { data: bounty } = await admin.from("bounties").select("id,requester_id,status,max_budget_base_units").eq("id", c.req.param("id")).eq("requester_id", c.get("userId")).in("status", ["active", "review"]).maybeSingle();
  if (!bounty) return c.json({ error: "Open bounty not found" }, 404);
  const { data: submission } = await admin.from("submissions").select("id,agent_id,proposed_amount_base_units").eq("id", body.submissionId).eq("bounty_id", bounty.id).maybeSingle();
  if (!submission) return c.json({ error: "Submission not found" }, 404);
  const { data: agent } = await admin.from("agents").select("runtime,name").eq("id", submission.agent_id).maybeSingle();
  const gross = String(submission.proposed_amount_base_units);
  if (BigInt(gross) > BigInt(String(bounty.max_budget_base_units))) return c.json({ error: "Submission exceeds the budget" }, 409);
  const cut = platformCut((agent?.runtime ?? "hosted") as "hosted" | "local" | "webhook", gross, { serviceBps: env.serviceFeeBps, hostedBps: env.hostedFeeBps });
  const { data: closed } = await admin.from("bounties").update({ status: "settled" }).eq("id", bounty.id).in("status", ["active", "review"]).select("id").maybeSingle();
  if (!closed) return c.json({ error: "Bounty was already settled" }, 409);
  await admin.from("submissions").update({ winner: false }).eq("bounty_id", bounty.id);
  await admin.from("submissions").update({ winner: true }).eq("id", submission.id);
  await admin.from("payments").insert({ bounty_id: bounty.id, kind: "settlement", status: "confirmed", amount_base_units: gross, submission_id: submission.id, confirmed_at: new Date().toISOString() });
  await admin.from("platform_fees").insert({ bounty_id: bounty.id, agent_id: submission.agent_id, submission_id: submission.id, runtime: agent?.runtime ?? "hosted", gross_base_units: gross, fee_bps: cut.feeBps, fee_base_units: cut.fee, net_base_units: cut.net, service_fee_bps: cut.serviceBps, hosting_fee_bps: cut.hostingBps, service_fee_base_units: cut.serviceFee, hosting_fee_base_units: cut.hostingFee, simulated: true });
  await recordAudit(c.get("userId"), "bounty_demo_settled_without_escrow", "bounty", bounty.id, { submissionId: submission.id, ...cut });
  return c.json({ status: "settled", simulated: true, agent: agent?.name ?? null, runtime: agent?.runtime ?? "hosted", ...cut });
});

/** For an external scheduler (cron) when the in-process worker is off. */
app.post("/internal/agents/tick", async (c) => {
  if (!env.internalWorkerToken || !verifySharedSecret(c.req.header("authorization")?.replace(/^Bearer\s+/i, ""), env.internalWorkerToken)) return c.json({ error: "Unauthorized" }, 401);
  return c.json({ results: await tickAll(runStore, agentExecutor) });
});

app.onError((error, c) => {
  console.error("api error", error.message);
  return c.json({ error: "Internal server error" }, 500);
});

if (process.env.NODE_ENV !== "test") {
  assertServerConfig();
  const { serve } = await import("@hono/node-server");
  serve({ fetch: app.fetch, port: env.port });
  console.log(`Bountiq API listening on ${env.port}`);
  maybeStartAgentWorker();
}

export default app;
