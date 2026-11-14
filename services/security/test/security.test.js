import test from "node:test";
import assert from "node:assert/strict";
import { Wallet } from "ethers";
import { hashLinkToken, isAllowedSubmissionUpload, isSafeExternalUrl, randomLinkToken, verifySharedSecret, verifyWalletSignature } from "../dist/index.js";

test("Telegram link tokens are random and stored as one-way hashes", () => {
  const token = randomLinkToken();
  assert.ok(token.length >= 40);
  assert.equal(hashLinkToken(token).length, 64);
  assert.notEqual(hashLinkToken(token), token);
});

test("shared webhook secret comparison requires exact secret", () => {
  assert.equal(verifySharedSecret("abc", "abc"), true);
  assert.equal(verifySharedSecret("abd", "abc"), false);
  assert.equal(verifySharedSecret(undefined, "abc"), false);
});

test("wallet challenge signature only verifies for its signer", async () => {
  const wallet = Wallet.createRandom();
  const other = Wallet.createRandom();
  const message = "Bountiq payout verification nonce";
  const signature = await wallet.signMessage(message);
  assert.equal(verifyWalletSignature(wallet.address, message, signature), true);
  assert.equal(verifyWalletSignature(other.address, message, signature), false);
});

test("external deliverable links must be public HTTPS URLs", () => {
  assert.equal(isSafeExternalUrl("https://example.org/work"), true);
  assert.equal(isSafeExternalUrl("http://example.org/work"), false);
  assert.equal(isSafeExternalUrl("https://127.0.0.1/work"), false);
  assert.equal(isSafeExternalUrl("javascript:alert(1)"), false);
});

test("submission uploads enforce the MIME allowlist and 50 MB limit", () => {
  assert.equal(isAllowedSubmissionUpload("application/pdf", 1024), true);
  assert.equal(isAllowedSubmissionUpload("application/x-msdownload", 1024), false);
  assert.equal(isAllowedSubmissionUpload("video/mp4", 51 * 1024 * 1024), false);
});
