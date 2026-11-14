const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("BountiqEscrow", function () {
  async function setup() {
    const [requester, winner, attacker, other] = await ethers.getSigners();
    const Escrow = await ethers.getContractFactory("BountiqEscrow");
    const escrow = await Escrow.deploy();
    const deadline = BigInt(await time.latest()) + 3600n;
    const externalId = ethers.id("bounty-1");
    await escrow.createBounty(externalId, deadline);
    const bountyId = 1n;
    return { escrow, requester, winner, attacker, other, deadline, externalId, bountyId };
  }

  it("creates unique bounty IDs and does not activate before confirmed funding", async function () {
    const { escrow, requester, bountyId, externalId, deadline } = await setup();
    let bounty = await escrow.getBounty(bountyId);
    expect(bounty.status).to.equal(0n); // Draft
    await expect(escrow.createBounty(externalId, deadline)).to.be.revertedWithCustomError(escrow, "DuplicateExternalId");
    await escrow.fundBounty(bountyId, { value: 1000n });
    bounty = await escrow.getBounty(bountyId);
    expect(bounty.status).to.equal(2n); // Active
    expect(bounty.requester).to.equal(requester.address);
    expect(bounty.fundedAmount).to.equal(1000n);
  });

  it("rejects funding and approval from unauthorized accounts", async function () {
    const { escrow, winner, attacker, bountyId } = await setup();
    await expect(escrow.connect(attacker).fundBounty(bountyId, { value: 100n }))
      .to.be.revertedWithCustomError(escrow, "Unauthorized");
    await escrow.fundBounty(bountyId, { value: 100n });
    await expect(escrow.connect(attacker).approveSettlement(bountyId, winner.address, 50n, ethers.id("submission")))
      .to.be.revertedWithCustomError(escrow, "Unauthorized");
  });

  it("pays the approved winner and refunds the unspent budget", async function () {
    const { escrow, requester, winner, bountyId } = await setup();
    const funded = 2000n;
    const payout = 1500n;
    await escrow.fundBounty(bountyId, { value: funded });
    await escrow.approveSettlement(bountyId, winner.address, payout, ethers.id("submission-1"));
    await expect(escrow.settleBounty(bountyId))
      .to.emit(escrow, "BountySettled")
      .withArgs(bountyId, winner.address, payout, requester.address, funded - payout);
    expect(await ethers.provider.getBalance(await escrow.getAddress())).to.equal(0n);
    expect((await escrow.getBounty(bountyId)).status).to.equal(3n); // Settled
  });

  it("rejects payout above escrow and duplicate settlement", async function () {
    const { escrow, winner, bountyId } = await setup();
    await escrow.fundBounty(bountyId, { value: 100n });
    await expect(escrow.approveSettlement(bountyId, winner.address, 101n, ethers.id("submission")))
      .to.be.revertedWithCustomError(escrow, "InvalidAmount");
    await escrow.approveSettlement(bountyId, winner.address, 100n, ethers.id("submission"));
    await escrow.settleBounty(bountyId);
    await expect(escrow.settleBounty(bountyId)).to.be.revertedWithCustomError(escrow, "InvalidStatus");
  });

  it("refunds an expired bounty and prevents later settlement", async function () {
    const { escrow, requester, winner, bountyId, deadline } = await setup();
    await escrow.fundBounty(bountyId, { value: 100n });
    await time.increaseTo(deadline + 1n);
    await expect(escrow.connect(requester).refundBounty(bountyId))
      .to.emit(escrow, "BountyRefunded").withArgs(bountyId, requester.address, 100n);
    await expect(escrow.approveSettlement(bountyId, winner.address, 10n, ethers.id("submission")))
      .to.be.revertedWithCustomError(escrow, "InvalidStatus");
    expect((await escrow.getBounty(bountyId)).status).to.equal(4n); // Refunded
  });

  it("does not allow a refund to cancel a recorded settlement authorization", async function () {
    const { escrow, requester, winner, bountyId, deadline } = await setup();
    await escrow.fundBounty(bountyId, { value: 100n });
    await escrow.approveSettlement(bountyId, winner.address, 80n, ethers.id("submission"));
    await time.increaseTo(deadline + 1n);
    await expect(escrow.connect(requester).refundBounty(bountyId))
      .to.be.revertedWithCustomError(escrow, "SettlementAlreadyApproved");
    await escrow.settleBounty(bountyId);
    expect((await escrow.getBounty(bountyId)).status).to.equal(3n);
  });
});
