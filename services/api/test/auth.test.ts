import { test } from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = "https://bountiq-test.supabase.co";
process.env.SUPABASE_ANON_KEY = "test-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
process.env.TELEGRAM_WEBHOOK_SECRET = "test-webhook-secret";

const { default: app } = await import("../src/server.js");

test("private profile API rejects requests without a bearer token", async () => {
  const response = await app.request("/api/profile");
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Authentication required" });
});

test("Telegram webhook rejects requests without its configured secret header", async () => {
  const response = await app.request("/api/telegram/webhook", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ update_id: 1 }) });
  assert.equal(response.status, 401);
});
