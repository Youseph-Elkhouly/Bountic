import { Interface, getAddress, isAddress, type TransactionRequest } from "ethers";
import { env } from "./env.js";

const escrowInterface = new Interface([
  "event BountyCreated(uint256 indexed bountyId,bytes32 indexed externalId,address indexed requester,uint64 deadline)",
  "event BountyFunded(uint256 indexed bountyId,address indexed requester,uint256 amount)",
  "event SettlementApproved(uint256 indexed bountyId,address indexed winner,uint256 payoutAmount,bytes32 indexed submissionId)",
  "event BountySettled(uint256 indexed bountyId,address indexed winner,uint256 payoutAmount,address indexed requester,uint256 refundAmount)",
  "event BountyRefunded(uint256 indexed bountyId,address indexed requester,uint256 amount)",
]);

type Client = {
  provider: {
    getTransaction(hash: string): Promise<{ from: string; to: string | null } | null>;
    getTransactionReceipt(hash: string): Promise<{ hash: string; blockNumber: number; status: number; to: string | null; logs: Array<{ address: string; topics: string[]; data: string }> } | null>;
  };
  escrowAddress: string;
  explorerUrl: string;
  prepareCreateBounty(externalId: string, deadlineUnix: number, requester: string): TransactionRequest;
  prepareFundBounty(bountyId: string, maxBudgetBaseUnits: string, requester: string): TransactionRequest;
  prepareApproveSettlement(bountyId: string, payoutWallet: string, amountBaseUnits: string, submissionId: string, requester: string): TransactionRequest;
  prepareSettleBounty(bountyId: string, sender: string): TransactionRequest;
  prepareRefundBounty(bountyId: string, requester: string): TransactionRequest;
  getBounty(bountyId: string): Promise<{ externalId: string; requester: string; winner: string; fundedAmount: bigint; payoutAmount: bigint; status: bigint | number; settlementApproved: boolean }>;
  confirmTransaction(hash: string, expectedEvent: "BountyCreated" | "BountyFunded" | "SettlementApproved" | "BountySettled" | "BountyRefunded"): Promise<{ hash: string; blockNumber: number; status: 1; explorerUrl: string }>;
};

export type JsonTransaction = {
  to: string;
  from?: string;
  data: string;
  value?: string;
  chainId: number;
};
type Confirmation = { status: "confirmed"; txHash: string; blockNumber: number; explorerUrl: string };
type ReceiptLog = { address: string; topics: string[]; data: string };

function jsonTransaction(tx: TransactionRequest): JsonTransaction {
  const chainId = tx.chainId;
  if (!tx.to || !tx.data || chainId === null || chainId === undefined) throw new Error("Payment library returned an incomplete transaction");
  if (BigInt(chainId) !== BigInt(env.goatChainId)) throw new Error("Payment transaction targets the wrong chain");
  return {
    to: String(tx.to),
    ...(tx.from ? { from: String(tx.from) } : {}),
    data: String(tx.data),
    ...(tx.value === undefined || tx.value === null ? {} : { value: BigInt(tx.value).toString() }),
    chainId: Number(chainId),
  };
}

/** Lazily loads the payments-owned package; the API never signs or broadcasts transactions. */
async function connectPayments(): Promise<Client> {
  if (!env.goatEscrowAddress || !isAddress(env.goatEscrowAddress)) throw new Error("BOUNTIQ_ESCROW_ADDRESS is not configured");
  const packageName = "@bountiq/payments";
  let library: { PaymentsClient: { connect(config: { rpcUrl: string; chainId: number; explorerUrl: string; escrowAddress: string }): Promise<Client> } };
  try {
    library = await import(packageName) as typeof library;
  } catch {
    throw new Error("Payments library is not installed in this checkout; merge feat/goat-payments and run npm install");
  }
  return library.PaymentsClient.connect({ rpcUrl: env.goatRpcUrl, chainId: env.goatChainId, explorerUrl: env.goatExplorerUrl, escrowAddress: env.goatEscrowAddress });
}

async function verifiedReceipt(client: Client, hash: string, event: Parameters<Client["confirmTransaction"]>[1], requester: string) {
  const confirmed = await client.confirmTransaction(hash, event);
  const [tx, receipt] = await Promise.all([client.provider.getTransaction(hash), client.provider.getTransactionReceipt(hash)]);
  if (!tx || !receipt || receipt.status !== 1 || receipt.hash.toLowerCase() !== hash.toLowerCase()) throw new Error("Transaction receipt is not confirmed");
  assertWalletIdentity(requester, tx.from);
  if (!tx.to || getAddress(tx.to) !== getAddress(client.escrowAddress) || !receipt.to || getAddress(receipt.to) !== getAddress(client.escrowAddress)) throw new Error("Transaction did not call the configured escrow");
  const parsed = receipt.logs.flatMap((log) => {
    if (getAddress(log.address) !== getAddress(client.escrowAddress)) return [];
    try { const eventLog = escrowInterface.parseLog(log); return eventLog?.name === event ? [eventLog] : []; } catch { return []; }
  });
  if (parsed.length !== 1) throw new Error(`Expected exactly one ${event} event from the configured escrow`);
  return { confirmed, event: parsed[0]!, receipt };
}

export function assertWalletIdentity(verifiedWallet: string, transactionSender: string) {
  if (!isAddress(verifiedWallet) || !isAddress(transactionSender) || getAddress(transactionSender) !== getAddress(verifiedWallet)) throw new Error("Transaction signer does not match the verified requester wallet");
}

export function decodeBountyCreatedEvent(logs: ReceiptLog[], escrowAddress: string, externalId: string, requester: string): string {
  const events = logs.flatMap((log) => {
    if (!isAddress(log.address) || getAddress(log.address) !== getAddress(escrowAddress)) return [];
    try { const parsed = escrowInterface.parseLog(log); return parsed?.name === "BountyCreated" ? [parsed] : []; } catch { return []; }
  });
  if (events.length !== 1) throw new Error("Expected one BountyCreated event from the configured escrow");
  const event = events[0]!;
  if (String(event.args.externalId).toLowerCase() !== externalId.toLowerCase() || getAddress(String(event.args.requester)) !== getAddress(requester)) throw new Error("BountyCreated event does not match the requested bounty or wallet");
  return String(event.args.bountyId);
}

export const payments = {
  getBountyState: async (onchainBountyId: string) => {
    const client = await connectPayments();
    const bounty = await client.getBounty(onchainBountyId);
    const statusCode = Number(bounty.status);
    const status = (["draft", "funding", "active", "settled", "refunded"] as const)[statusCode] ?? "unknown";
    const fundedAmountBaseUnits = BigInt(bounty.fundedAmount).toString();
    const remainingEscrowBaseUnits = status === "active" ? fundedAmountBaseUnits : "0";
    return { onchainBountyId, status, statusCode, requester: getAddress(bounty.requester), winner: /^0x0{40}$/i.test(bounty.winner) ? null : getAddress(bounty.winner), fundedAmountBaseUnits, payoutAmountBaseUnits: BigInt(bounty.payoutAmount).toString(), remainingEscrowBaseUnits, settlementApproved: bounty.settlementApproved };
  },
  prepareCreate: async (input: { externalId: string; deadline: number; requesterWallet: string }) => {
    const client = await connectPayments();
    return { phase: "create" as const, transaction: jsonTransaction(client.prepareCreateBounty(input.externalId, input.deadline, getAddress(input.requesterWallet))) };
  },
  confirmCreate: async (input: { externalId: string; txHash: string; requesterWallet: string }) => {
    const client = await connectPayments();
    const { confirmed, receipt } = await verifiedReceipt(client, input.txHash, "BountyCreated", input.requesterWallet);
    const onchainBountyId = decodeBountyCreatedEvent(receipt.logs, client.escrowAddress, input.externalId, input.requesterWallet);
    const bounty = await client.getBounty(onchainBountyId);
    if (getAddress(bounty.requester) !== getAddress(input.requesterWallet) || String(bounty.externalId).toLowerCase() !== input.externalId.toLowerCase()) throw new Error("Created bounty does not match the confirmed event");
    return { ...confirmation(confirmed), onchainBountyId };
  },
  prepareFund: async (input: { onchainBountyId: string; amountBaseUnits: string; requesterWallet: string }) => {
    const client = await connectPayments();
    return { phase: "fund" as const, onchainBountyId: input.onchainBountyId, transaction: jsonTransaction(client.prepareFundBounty(input.onchainBountyId, input.amountBaseUnits, getAddress(input.requesterWallet))) };
  },
  confirmFunding: async (input: { onchainBountyId: string; amountBaseUnits: string; txHash: string; requesterWallet: string }): Promise<Confirmation & { onchainBountyId: string }> => {
    const client = await connectPayments();
    const { confirmed, event } = await verifiedReceipt(client, input.txHash, "BountyFunded", input.requesterWallet);
    if (String(event.args.bountyId) !== input.onchainBountyId || getAddress(String(event.args.requester)) !== getAddress(input.requesterWallet) || BigInt(event.args.amount) !== BigInt(input.amountBaseUnits)) throw new Error("BountyFunded event does not match the authorized amount, ID, or wallet");
    const bounty = await client.getBounty(input.onchainBountyId);
    if (getAddress(bounty.requester) !== getAddress(input.requesterWallet) || BigInt(bounty.fundedAmount) !== BigInt(input.amountBaseUnits) || Number(bounty.status) !== 2) throw new Error("Escrow state does not confirm the expected funding");
    return { ...confirmation(confirmed), onchainBountyId: input.onchainBountyId };
  },
  approveSettlement: async (input: { onchainBountyId: string; payoutWallet: string; amountBaseUnits: string; submissionId: string; requesterWallet: string }) => {
    const client = await connectPayments();
    const submissionHash = `0x${input.submissionId.replaceAll("-", "")}`;
    return { transaction: jsonTransaction(client.prepareApproveSettlement(input.onchainBountyId, getAddress(input.payoutWallet), input.amountBaseUnits, submissionHash, getAddress(input.requesterWallet))) };
  },
  confirmSettlementApproval: async (input: { onchainBountyId: string; payoutWallet: string; amountBaseUnits: string; submissionId: string; txHash: string; requesterWallet: string }) => {
    const client = await connectPayments();
    const { confirmed, event } = await verifiedReceipt(client, input.txHash, "SettlementApproved", input.requesterWallet);
    const expectedSubmissionId = `0x${input.submissionId.replaceAll("-", "")}`;
    if (String(event.args.bountyId) !== input.onchainBountyId || getAddress(String(event.args.winner)) !== getAddress(input.payoutWallet) || BigInt(event.args.payoutAmount) !== BigInt(input.amountBaseUnits) || String(event.args.submissionId).toLowerCase() !== expectedSubmissionId.toLowerCase()) throw new Error("SettlementApproved event does not match the authorized submission");
    const bounty = await client.getBounty(input.onchainBountyId);
    if (!bounty.settlementApproved || getAddress(bounty.winner) !== getAddress(input.payoutWallet) || BigInt(bounty.payoutAmount) !== BigInt(input.amountBaseUnits)) throw new Error("Escrow state does not confirm the authorized settlement");
    return confirmation(confirmed);
  },
  prepareSettlementExecution: async (input: { onchainBountyId: string; requesterWallet: string }) => {
    const client = await connectPayments();
    return { transaction: jsonTransaction(client.prepareSettleBounty(input.onchainBountyId, getAddress(input.requesterWallet))) };
  },
  confirmSettlement: async (input: { onchainBountyId: string; payoutWallet: string; amountBaseUnits: string; txHash: string; requesterWallet: string }): Promise<Confirmation & { refundAmountBaseUnits: string }> => {
    const client = await connectPayments();
    const { confirmed, event } = await verifiedReceipt(client, input.txHash, "BountySettled", input.requesterWallet);
    if (String(event.args.bountyId) !== input.onchainBountyId || getAddress(String(event.args.winner)) !== getAddress(input.payoutWallet) || getAddress(String(event.args.requester)) !== getAddress(input.requesterWallet) || BigInt(event.args.payoutAmount) !== BigInt(input.amountBaseUnits)) throw new Error("BountySettled event does not match the authorized settlement");
    const bounty = await client.getBounty(input.onchainBountyId);
    if (Number(bounty.status) !== 3) throw new Error("Escrow is not in settled state");
    return { ...confirmation(confirmed), refundAmountBaseUnits: BigInt(event.args.refundAmount).toString() };
  },
  prepareRefund: async (input: { onchainBountyId: string; requesterWallet: string }) => {
    const client = await connectPayments();
    return { transaction: jsonTransaction(client.prepareRefundBounty(input.onchainBountyId, getAddress(input.requesterWallet))) };
  },
  confirmRefund: async (input: { onchainBountyId: string; txHash: string; requesterWallet: string; expectedAmountBaseUnits: string }): Promise<Confirmation & { amountBaseUnits: string }> => {
    const client = await connectPayments();
    const { confirmed, event } = await verifiedReceipt(client, input.txHash, "BountyRefunded", input.requesterWallet);
    if (String(event.args.bountyId) !== input.onchainBountyId || getAddress(String(event.args.requester)) !== getAddress(input.requesterWallet) || BigInt(event.args.amount) !== BigInt(input.expectedAmountBaseUnits)) throw new Error("BountyRefunded event does not match the expected escrow");
    const bounty = await client.getBounty(input.onchainBountyId);
    if (Number(bounty.status) !== 4) throw new Error("Escrow is not in refunded state");
    return { ...confirmation(confirmed), amountBaseUnits: BigInt(event.args.amount).toString() };
  },
};

function confirmation(value: { hash: string; blockNumber: number; explorerUrl: string }): Confirmation {
  return { status: "confirmed", txHash: value.hash, blockNumber: value.blockNumber, explorerUrl: value.explorerUrl };
}

export function serializePaymentValue(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(serializePaymentValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, item]) => typeof item !== "function" && item !== undefined).map(([key, item]) => [key, serializePaymentValue(item)]));
  return value;
}
