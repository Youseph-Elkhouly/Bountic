export const escrowAbi = [
  "function createBounty(bytes32 externalId,uint64 deadline) returns (uint256 bountyId)",
  "function fundBounty(uint256 bountyId) payable",
  "function approveSettlement(uint256 bountyId,address winner,uint256 payoutAmount,bytes32 submissionId)",
  "function settleBounty(uint256 bountyId)",
  "function refundBounty(uint256 bountyId)",
  "function getBounty(uint256 bountyId) view returns ((bytes32 externalId,address requester,address winner,uint64 deadline,uint128 fundedAmount,uint128 payoutAmount,uint8 status,bool settlementApproved))",
  "event BountyCreated(uint256 indexed bountyId,bytes32 indexed externalId,address indexed requester,uint64 deadline)",
  "event BountyFunded(uint256 indexed bountyId,address indexed requester,uint256 amount)",
  "event SettlementApproved(uint256 indexed bountyId,address indexed winner,uint256 payoutAmount,bytes32 indexed submissionId)",
  "event BountySettled(uint256 indexed bountyId,address indexed winner,uint256 payoutAmount,address indexed requester,uint256 refundAmount)",
  "event BountyRefunded(uint256 indexed bountyId,address indexed requester,uint256 amount)"
] as const;
