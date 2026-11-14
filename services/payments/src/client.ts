import {
  Contract,
  Interface,
  JsonRpcProvider,
  getAddress,
  isHexString,
  type TransactionRequest,
} from "ethers";
import { escrowAbi } from "./escrowAbi.js";
import { parseBaseUnits, parseBountyId } from "./units.js";

export const GOAT_TESTNET3 = {
  chainId: 48816n,
  rpcUrl: "https://rpc.testnet3.goat.network",
  explorerUrl: "https://explorer.testnet3.goat.network",
} as const;

export type PaymentConfig = {
  rpcUrl?: string;
  chainId?: number;
  explorerUrl?: string;
  escrowAddress: string;
};

export type ConfirmedTransaction = {
  hash: string;
  blockNumber: number;
  status: 1;
  explorerUrl: string;
};

export class PaymentsClient {
  readonly provider: JsonRpcProvider;
  readonly escrowAddress: string;
  readonly explorerUrl: string;
  private readonly iface = new Interface(escrowAbi);

  private constructor(provider: JsonRpcProvider, escrowAddress: string, explorerUrl: string) {
    this.provider = provider;
    this.escrowAddress = escrowAddress;
    this.explorerUrl = explorerUrl;
  }

  static async connect(config: PaymentConfig): Promise<PaymentsClient> {
    const chainId = BigInt(config.chainId ?? Number(GOAT_TESTNET3.chainId));
    if (chainId !== GOAT_TESTNET3.chainId) throw new Error("Only GOAT Network Testnet3 is enabled");
    const provider = new JsonRpcProvider(config.rpcUrl ?? GOAT_TESTNET3.rpcUrl, Number(chainId), {
      staticNetwork: true,
    });
    const actual = await provider.getNetwork();
    if (actual.chainId !== GOAT_TESTNET3.chainId) throw new Error(`Unexpected chain ID ${actual.chainId}`);
    return new PaymentsClient(
      provider,
      getAddress(config.escrowAddress),
      config.explorerUrl ?? GOAT_TESTNET3.explorerUrl,
    );
  }

  /** Build unsigned txs for the authenticated requester wallet to sign. */
  prepareCreateBounty(externalId: string, deadlineUnix: number, requester: string): TransactionRequest {
    if (!isHexString(externalId, 32) || /^0x0{64}$/i.test(externalId)) throw new Error("Invalid external bounty ID");
    if (!Number.isSafeInteger(deadlineUnix) || deadlineUnix <= Math.floor(Date.now() / 1000)) throw new Error("Invalid deadline");
    return this.tx("createBounty", [externalId, deadlineUnix], requester);
  }

  prepareFundBounty(bountyId: string, maxBudgetBaseUnits: string, requester: string): TransactionRequest {
    return this.tx("fundBounty", [parseBountyId(bountyId)], requester, parseBaseUnits(maxBudgetBaseUnits));
  }

  prepareApproveSettlement(
    bountyId: string,
    verifiedPayoutWallet: string,
    payoutBaseUnits: string,
    submissionId: string,
    requester: string,
  ): TransactionRequest {
    if (!isHexString(submissionId, 32) || /^0x0{64}$/i.test(submissionId)) throw new Error("Invalid submission ID");
    return this.tx("approveSettlement", [
      parseBountyId(bountyId),
      getAddress(verifiedPayoutWallet),
      parseBaseUnits(payoutBaseUnits),
      submissionId,
    ], requester);
  }

  prepareSettleBounty(bountyId: string, sender: string): TransactionRequest {
    return this.tx("settleBounty", [parseBountyId(bountyId)], sender);
  }

  prepareRefundBounty(bountyId: string, requester: string): TransactionRequest {
    return this.tx("refundBounty", [parseBountyId(bountyId)], requester);
  }

  async getBounty(bountyId: string) {
    const contract = new Contract(this.escrowAddress, escrowAbi, this.provider);
    return contract.getBounty(parseBountyId(bountyId));
  }

  /** Only record success after canonical RPC receipt reports status 1. */
  async confirmTransaction(
    hash: string,
    expectedEvent: "BountyCreated" | "BountyFunded" | "SettlementApproved" | "BountySettled" | "BountyRefunded",
  ): Promise<ConfirmedTransaction> {
    if (!isHexString(hash, 32)) throw new Error("Invalid transaction hash");
    const receipt = await this.provider.waitForTransaction(hash, 1);
    if (!receipt || receipt.status !== 1) throw new Error("Transaction is not confirmed successfully");
    if (getAddress(receipt.to ?? "") !== this.escrowAddress) throw new Error("Transaction did not call the configured escrow");
    const emittedExpectedEvent = receipt.logs.some((log) => {
      if (getAddress(log.address) !== this.escrowAddress) return false;
      try { return this.iface.parseLog(log)?.name === expectedEvent; } catch { return false; }
    });
    if (!emittedExpectedEvent) throw new Error(`Confirmed transaction did not emit ${expectedEvent}`);
    const network = await this.provider.getNetwork();
    if (network.chainId !== GOAT_TESTNET3.chainId) throw new Error("Receipt was checked on an unexpected network");
    return {
      hash: receipt.hash,
      blockNumber: receipt.blockNumber,
      status: 1,
      explorerUrl: `${this.explorerUrl}/tx/${receipt.hash}`,
    };
  }

  private tx(method: string, args: readonly unknown[], from: string, value?: bigint): TransactionRequest {
    return {
      to: this.escrowAddress,
      from: getAddress(from),
      data: this.iface.encodeFunctionData(method, [...args]),
      ...(value === undefined ? {} : { value }),
      chainId: GOAT_TESTNET3.chainId,
    };
  }
}
