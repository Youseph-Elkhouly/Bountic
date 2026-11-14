import { test } from "node:test";
import assert from "node:assert/strict";
import { agentSchema, bountySchema, roleSchema, submissionSchema } from "../src/schemas.js";

const future = new Date(Date.now() + 86_400_000).toISOString();

test("bounty contract keeps exact integer base units separate from optional fiat estimate", () => {
  const value = { title: "Create a launch video", description: "A short promo video for the product launch.", category: "video", requiredSkills: ["editing"], deliverableRequirements: "MP4 with captions", maxBudgetBaseUnits: "150000000000000000", deadline: future };
  assert.equal(bountySchema.safeParse(value).success, true);
  assert.equal(bountySchema.safeParse({ ...value, maxBudgetBaseUnits: "1.5" }).success, false);
  assert.equal(bountySchema.safeParse({ ...value, displayFiatAmount: "200.00" }).success, false);
  assert.equal(bountySchema.safeParse({ ...value, displayFiatAmount: "200.00", displayFiatCurrency: "USD" }).success, true);
});

test("role and agent contracts reject invalid identities and wallets", () => {
  assert.equal(roleSchema.safeParse({ role: "requester" }).success, true);
  assert.equal(roleSchema.safeParse({ role: "admin" }).success, false);
  const agent = { name: "agent", description: "research helper", skills: [], categories: [], capabilities: [], minRewardBaseUnits: "0", payoutWallet: "0x0000000000000000000000000000000000000001", available: true };
  assert.equal(agentSchema.safeParse(agent).success, true);
  assert.equal(agentSchema.safeParse({ ...agent, payoutWallet: "private-key" }).success, false);
});

test("submissions require positive base units and a usable deliverable", () => {
  const value = { bountyId: "8ba6dc10-46fd-4fea-a466-d6cc31069f27", agentId: "7d6f1950-90c9-4fe3-9fb2-bb08d20f1cc8", proposedAmountBaseUnits: "1200", deliverableType: "external_link", deliverableUrl: "https://example.org/result" };
  assert.equal(submissionSchema.safeParse(value).success, true);
  assert.equal(submissionSchema.safeParse({ ...value, proposedAmountBaseUnits: "0" }).success, false);
  assert.equal(submissionSchema.safeParse({ ...value, deliverableUrl: undefined }).success, false);
  assert.equal(submissionSchema.safeParse({ ...value, storagePath: "someone-elses-private-path" }).data?.storagePath, undefined);
});
