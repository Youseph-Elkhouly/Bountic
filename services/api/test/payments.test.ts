import { test } from "node:test";
import assert from "node:assert/strict";
import { Interface } from "ethers";
import { assertWalletIdentity, decodeBountyCreatedEvent, serializePaymentValue } from "../src/payments.js";
import { supportsAutonomousTextCategory } from "../src/agents/policy.js";

const escrow = "0x00000000000000000000000000000000000000aa";
const wallet = "0x00000000000000000000000000000000000000bb";
const externalId = `0x${"12".repeat(32)}`;
const eventInterface = new Interface(["event BountyCreated(uint256 indexed bountyId,bytes32 indexed externalId,address indexed requester,uint64 deadline)"]);

test("payment transaction data serializes all bigint amounts as exact decimal strings", () => {
  const value = { value: 123456789012345678901234n, nested: [7n, { chainId: 48816n }] };
  const serialized = serializePaymentValue(value);
  assert.deepEqual(serialized, { value: "123456789012345678901234", nested: ["7", { chainId: "48816" }] });
  assert.doesNotThrow(() => JSON.stringify(serialized));
});

test("bounty identity is extracted only from the expected escrow event arguments", () => {
  const encoded = eventInterface.encodeEventLog(eventInterface.getEvent("BountyCreated")!, [91n, externalId, wallet, 1_900_000_000]);
  const id = decodeBountyCreatedEvent([{ address: escrow, topics: encoded.topics, data: encoded.data }], escrow, externalId, wallet);
  assert.equal(id, "91");
  assert.throws(() => decodeBountyCreatedEvent([{ address: "0x00000000000000000000000000000000000000cc", topics: encoded.topics, data: encoded.data }], escrow, externalId, wallet));
  assert.throws(() => decodeBountyCreatedEvent([{ address: escrow, topics: encoded.topics, data: encoded.data }], escrow, `0x${"34".repeat(32)}`, wallet));
});

test("requester transaction sender must equal the verified wallet", () => {
  assert.doesNotThrow(() => assertWalletIdentity(wallet, wallet));
  assert.throws(() => assertWalletIdentity(wallet, escrow), /verified requester wallet/);
});

test("autonomous runner admits only its bounded text task categories", () => {
  assert.equal(supportsAutonomousTextCategory("Research"), true);
  assert.equal(supportsAutonomousTextCategory("writing"), true);
  assert.equal(supportsAutonomousTextCategory("browser automation"), false);
  assert.equal(supportsAutonomousTextCategory("video"), false);
});
