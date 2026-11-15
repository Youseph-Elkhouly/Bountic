// Development only: creates email-confirmed test accounts with a role already chosen,
// so you can sign in to each dashboard without the email verification and onboarding steps.
// Usage (from services/api): npm run seed:test-users
import { randomBytes } from "node:crypto";
import type { User } from "@supabase/supabase-js";
import { admin } from "../src/supabase.js";
import { env } from "../src/env.js";

const accounts = [
  { email: process.env.TEST_REQUESTER_EMAIL || "requester@test.bountiq.dev", role: "requester" },
  { email: process.env.TEST_EARNER_EMAIL || "earner@test.bountiq.dev", role: "earner" },
] as const;

if (!env.supabaseUrl || !env.supabaseSecretKey) throw new Error("Set SUPABASE_URL and SUPABASE_SECRET_KEY in services/api/.env");

const configuredPassword = process.env.TEST_USER_PASSWORD;
if (configuredPassword !== undefined && configuredPassword.length < 8) throw new Error("TEST_USER_PASSWORD must be at least 8 characters");
const newPassword = configuredPassword || randomBytes(12).toString("base64url");

async function findUser(email: string): Promise<User | undefined> {
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const match = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (match || data.users.length < 1000) return match;
  }
}

for (const { email, role } of accounts) {
  const existing = await findUser(email);
  let userId: string;
  let password = "(unchanged; set TEST_USER_PASSWORD to reset it)";
  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, { email_confirm: true, ...(configuredPassword ? { password: configuredPassword } : {}) });
    if (error) throw error;
    userId = existing.id;
    if (configuredPassword) password = configuredPassword;
  } else {
    const { data, error } = await admin.auth.admin.createUser({ email, password: newPassword, email_confirm: true });
    if (error) throw error;
    userId = data.user.id;
    password = newPassword;
  }

  // The on_auth_user_created trigger inserts the profile; upsert covers projects created before it existed.
  const { error: profileError } = await admin.from("profiles").upsert({ id: userId, role }, { onConflict: "id" });
  if (profileError) throw profileError;
  console.log(`${role.padEnd(9)} ${email}  password: ${password}`);
}
