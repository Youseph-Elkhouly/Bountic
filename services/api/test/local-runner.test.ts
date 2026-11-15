import assert from "node:assert/strict";
import test from "node:test";
import { hashRunnerKey, looksLikeRunnerKey, newRunnerKey, nextLocalJob, platformCut, submitLocalRun } from "../src/agents/local.js";
import { MemoryRunStore, agentFixture, bountyFixture } from "../src/agents/memoryStore.js";
import { tickAll } from "../src/agents/runner.js";
import type { Executor } from "../src/agents/types.js";

function setup(overrides = {}) {
  const store = new MemoryRunStore();
  const agent = agentFixture({ name: "Homebot", runtime: "local", skills: ["copywriting"], categories: ["writing"], ...overrides });
  store.agents.set(agent.id, agent);
  const bounty = bountyFixture({ title: "Tagline", required_skills: ["copywriting"], max_budget_base_units: "1000" });
  store.bounties.set(bounty.id, bounty);
  return { store, agent, bounty };
}

test("runner keys are random, recognisable and stored only as a hash", () => {
  const a = newRunnerKey(), b = newRunnerKey();
  assert.notEqual(a, b);
  assert.ok(looksLikeRunnerKey(a));
  assert.ok(!looksLikeRunnerKey("bqa_short"));
  assert.equal(hashRunnerKey(a).length, 64);
  assert.notEqual(hashRunnerKey(a), a);
});

test("hosted worker never runs a local agent; the local runner pulls the job itself", async () => {
  const { store, agent } = setup();
  const never: Executor = { execute: async () => { throw new Error("hosted executor must not run"); } };
  await tickAll(store, never);
  assert.equal(store.runs.length, 0);
  const { job } = await nextLocalJob(store, agent);
  assert.ok(job);
  assert.equal(job.bidBaseUnits, "900");
  assert.equal(store.runs[0].status, "working");
  const result = await submitLocalRun(store, agent, job.runId, "Fresh tagline");
  assert.equal(result.ok, true);
  assert.equal(store.submissions.length, 1);
  assert.equal(store.submissions[0].proposedAmountBaseUnits, "900");
  assert.equal(store.runs[0].status, "submitted");
});

test("local runner can't double-claim, respects limits, and can't submit twice or for another agent's run", async () => {
  const { store, agent } = setup({ max_concurrent_jobs: 1 });
  const first = await nextLocalJob(store, agent);
  assert.ok(first.job);
  const second = await nextLocalJob(store, agent);
  assert.equal(second.job, null);
  assert.match(second.reason ?? "", /concurrent/);
  const other = agentFixture({ name: "Other", runtime: "local" });
  store.agents.set(other.id, other);
  assert.equal((await submitLocalRun(store, other, first.job.runId, "x")).ok, false);
  assert.equal((await submitLocalRun(store, agent, first.job.runId, "done")).ok, true);
  const again = await submitLocalRun(store, agent, first.job.runId, "done again");
  assert.equal(again.ok, false);
  assert.equal(store.submissions.length, 1);
});

test("auto-submit off holds the local draft for review", async () => {
  const { store, agent } = setup({ auto_submit: false });
  const { job } = await nextLocalJob(store, agent);
  const result = await submitLocalRun(store, agent, job!.runId, "draft");
  assert.deepEqual(result, { ok: true, submissionId: "", held: true });
  assert.equal(store.submissions.length, 0);
  assert.equal(store.runs[0].status, "awaiting_review");
});

test("platform cut: 10% on hosted agents, nothing on own-hardware agents, exact integer math", () => {
  assert.deepEqual(platformCut("hosted", "900", 1000), { feeBps: 1000, gross: "900", fee: "90", net: "810" });
  assert.deepEqual(platformCut("local", "900", 1000), { feeBps: 0, gross: "900", fee: "0", net: "900" });
  assert.deepEqual(platformCut("webhook", "900", 1000), { feeBps: 0, gross: "900", fee: "0", net: "900" });
  assert.equal(platformCut("hosted", "7", 1000).fee, "0");
  const big = "123456789012345678901234567890";
  const cut = platformCut("hosted", big, 1000);
  assert.equal(BigInt(cut.fee) + BigInt(cut.net), BigInt(big));
});
