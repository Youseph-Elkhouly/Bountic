// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Native-asset escrow for Bountiq bounties. On GOAT Testnet3, native
/// value is BTC-denominated. Amounts are exact EVM base units (wei), never USD.
contract BountiqEscrow is ReentrancyGuard {
    enum Status { Draft, Funding, Active, Settled, Refunded }

    struct Bounty {
        bytes32 externalId;
        address requester;
        address winner;
        uint64 deadline;
        uint128 fundedAmount;
        uint128 payoutAmount;
        Status status;
        bool settlementApproved;
    }

    uint256 public nextBountyId = 1;
    mapping(uint256 => Bounty) private bounties;
    mapping(bytes32 => uint256) public bountyIdByExternalId;

    error InvalidExternalId();
    error DuplicateExternalId();
    error InvalidDeadline();
    error UnknownBounty();
    error Unauthorized();
    error InvalidStatus();
    error InvalidAmount();
    error AmountTooLarge();
    error DeadlineNotReached();
    error DeadlinePassed();
    error SettlementAlreadyApproved();
    error SettlementNotApproved();
    error TransferFailed();

    event BountyCreated(uint256 indexed bountyId, bytes32 indexed externalId, address indexed requester, uint64 deadline);
    event BountyFunded(uint256 indexed bountyId, address indexed requester, uint256 amount);
    event SettlementApproved(uint256 indexed bountyId, address indexed winner, uint256 payoutAmount, bytes32 indexed submissionId);
    event BountySettled(uint256 indexed bountyId, address indexed winner, uint256 payoutAmount, address indexed requester, uint256 refundAmount);
    event BountyRefunded(uint256 indexed bountyId, address indexed requester, uint256 amount);

    /// @notice Create an on-chain bounty identity. Funding is a separate step.
    function createBounty(bytes32 externalId, uint64 deadline) external returns (uint256 bountyId) {
        if (externalId == bytes32(0)) revert InvalidExternalId();
        if (bountyIdByExternalId[externalId] != 0) revert DuplicateExternalId();
        if (deadline <= block.timestamp) revert InvalidDeadline();

        bountyId = nextBountyId++;
        bounties[bountyId] = Bounty({
            externalId: externalId,
            requester: msg.sender,
            winner: address(0),
            deadline: deadline,
            fundedAmount: 0,
            payoutAmount: 0,
            status: Status.Draft,
            settlementApproved: false
        });
        bountyIdByExternalId[externalId] = bountyId;
        emit BountyCreated(bountyId, externalId, msg.sender, deadline);
    }

    /// @notice Lock the maximum budget in native GOAT Testnet3 BTC base units.
    function fundBounty(uint256 bountyId) external payable {
        Bounty storage bounty = _bounty(bountyId);
        if (msg.sender != bounty.requester) revert Unauthorized();
        if (bounty.status != Status.Draft) revert InvalidStatus();
        if (block.timestamp > bounty.deadline) revert DeadlinePassed();
        if (msg.value == 0) revert InvalidAmount();
        if (msg.value > type(uint128).max) revert AmountTooLarge();

        bounty.fundedAmount = uint128(msg.value);
        bounty.status = Status.Active;
        emit BountyFunded(bountyId, msg.sender, msg.value);
    }

    /// @notice Requester immutably authorizes one verified winning submission.
    /// The caller must have checked submission ownership and payout off-chain.
    function approveSettlement(uint256 bountyId, address winner, uint256 payoutAmount, bytes32 submissionId) external {
        Bounty storage bounty = _bounty(bountyId);
        if (msg.sender != bounty.requester) revert Unauthorized();
        if (bounty.status != Status.Active) revert InvalidStatus();
        if (block.timestamp > bounty.deadline) revert DeadlinePassed();
        if (bounty.settlementApproved) revert SettlementAlreadyApproved();
        if (winner == address(0) || winner == bounty.requester || submissionId == bytes32(0)) revert InvalidAmount();
        if (payoutAmount == 0 || payoutAmount > bounty.fundedAmount) revert InvalidAmount();
        if (payoutAmount > type(uint128).max) revert AmountTooLarge();

        bounty.winner = winner;
        bounty.payoutAmount = uint128(payoutAmount);
        bounty.settlementApproved = true;
        emit SettlementApproved(bountyId, winner, payoutAmount, submissionId);
    }

    /// @notice Anyone may execute an already-authorized settlement. Funds only
    /// go to the immutable winner and the remaining budget returns to requester.
    function settleBounty(uint256 bountyId) external nonReentrant {
        Bounty storage bounty = _bounty(bountyId);
        if (bounty.status != Status.Active) revert InvalidStatus();
        if (!bounty.settlementApproved) revert SettlementNotApproved();

        uint256 payout = bounty.payoutAmount;
        uint256 refund = uint256(bounty.fundedAmount) - payout;
        address winner = bounty.winner;
        address requester = bounty.requester;
        bounty.status = Status.Settled;

        (bool paid, ) = payable(winner).call{value: payout}("");
        if (!paid) revert TransferFailed();
        if (refund != 0) {
            (bool refunded, ) = payable(requester).call{value: refund}("");
            if (!refunded) revert TransferFailed();
        }
        emit BountySettled(bountyId, winner, payout, requester, refund);
    }

    /// @notice Requester may reclaim funds only after the deadline and only if
    /// no settlement authorization was recorded.
    function refundBounty(uint256 bountyId) external nonReentrant {
        Bounty storage bounty = _bounty(bountyId);
        if (msg.sender != bounty.requester) revert Unauthorized();
        if (bounty.status != Status.Active) revert InvalidStatus();
        if (block.timestamp <= bounty.deadline) revert DeadlineNotReached();
        if (bounty.settlementApproved) revert SettlementAlreadyApproved();

        uint256 amount = bounty.fundedAmount;
        address requester = bounty.requester;
        bounty.status = Status.Refunded;
        (bool refunded, ) = payable(requester).call{value: amount}("");
        if (!refunded) revert TransferFailed();
        emit BountyRefunded(bountyId, requester, amount);
    }

    function getBounty(uint256 bountyId) external view returns (Bounty memory) {
        return _bounty(bountyId);
    }

    function _bounty(uint256 bountyId) private view returns (Bounty storage bounty) {
        bounty = bounties[bountyId];
        if (bountyId == 0 || bounty.requester == address(0)) revert UnknownBounty();
    }
}
