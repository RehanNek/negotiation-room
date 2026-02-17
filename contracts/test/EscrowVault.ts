import { expect } from 'chai';
import { ethers } from 'hardhat';
import { time } from '@nomicfoundation/hardhat-network-helpers';

const ONE_ETH = ethers.parseEther('1');

describe('EscrowVault', function () {
  async function deployFixture() {
    const [deployer, verifier, payer, partyTrue, partyFalse, stranger] = await ethers.getSigners();

    const EscrowVault = await ethers.getContractFactory('EscrowVault', deployer);
    const vault = await EscrowVault.deploy(verifier.address);
    await vault.waitForDeployment();

    return {
      vault,
      deployer,
      verifier,
      payer,
      partyTrue,
      partyFalse,
      stranger,
    };
  }

  async function signSettlement(
    vaultAddress: string,
    chainId: bigint,
    verifier: any,
    dealHash: string,
    verdict: boolean,
    attestationHash: string,
    nonce: bigint
  ) {
    const domain = {
      name: 'TheRoomEscrowVault',
      version: '1',
      chainId,
      verifyingContract: vaultAddress,
    };

    const types = {
      Settlement: [
        { name: 'dealHash', type: 'bytes32' },
        { name: 'verdict', type: 'bool' },
        { name: 'attestationHash', type: 'bytes32' },
        { name: 'nonce', type: 'uint256' },
      ],
    };

    const message = {
      dealHash,
      verdict,
      attestationHash,
      nonce,
    };

    return verifier.signTypedData(domain, types, message);
  }

  it('fundDeal stores immutable config and amount once', async function () {
    const { vault, payer, partyTrue, partyFalse } = await deployFixture();
    const now = await time.latest();
    const timeout = BigInt(now + 3600);
    const dealHash = ethers.keccak256(ethers.toUtf8Bytes('deal-1'));

    await expect(
      vault
        .connect(payer)
        .fundDeal(dealHash, partyTrue.address, partyFalse.address, timeout, { value: ONE_ETH })
    )
      .to.emit(vault, 'DealFunded')
      .withArgs(dealHash, payer.address, ONE_ETH, partyTrue.address, partyFalse.address, timeout);

    const deal = await vault.getDeal(dealHash);
    expect(deal.amount).to.equal(ONE_ETH);
    expect(deal.payer).to.equal(payer.address);
    expect(deal.recipientIfTrue).to.equal(partyTrue.address);
    expect(deal.recipientIfFalse).to.equal(partyFalse.address);
    expect(deal.funded).to.equal(true);

    await expect(
      vault
        .connect(payer)
        .fundDeal(dealHash, partyTrue.address, partyFalse.address, timeout, { value: ONE_ETH })
    ).to.be.revertedWithCustomError(vault, 'DealAlreadyFunded');
  });

  it('settleDeal succeeds with valid verifier signature and routes TRUE payout', async function () {
    const { vault, verifier, payer, partyTrue, partyFalse } = await deployFixture();
    const { chainId } = await ethers.provider.getNetwork();
    const dealHash = ethers.keccak256(ethers.toUtf8Bytes('deal-2'));
    const attestationHash = ethers.keccak256(ethers.toUtf8Bytes('attestation-2'));
    const timeout = BigInt((await time.latest()) + 7200);

    await vault
      .connect(payer)
      .fundDeal(dealHash, partyTrue.address, partyFalse.address, timeout, { value: ONE_ETH });

    const nonce = await vault.settlementNonces(dealHash);
    const signature = await signSettlement(
      await vault.getAddress(),
      chainId,
      verifier,
      dealHash,
      true,
      attestationHash,
      nonce
    );

    const before = await ethers.provider.getBalance(partyTrue.address);
    const tx = await vault.connect(payer).settleDeal(dealHash, true, attestationHash, signature);
    await tx.wait();
    const after = await ethers.provider.getBalance(partyTrue.address);

    expect(after - before).to.equal(ONE_ETH);

    const deal = await vault.getDeal(dealHash);
    expect(deal.settled).to.equal(true);
    expect(deal.releasedToTrue).to.equal(true);
    expect(deal.attestationHash).to.equal(attestationHash);
  });

  it('reused signature/nonce cannot settle a closed deal', async function () {
    const { vault, verifier, payer, partyTrue, partyFalse } = await deployFixture();
    const { chainId } = await ethers.provider.getNetwork();
    const dealHash = ethers.keccak256(ethers.toUtf8Bytes('deal-3'));
    const attestationHash = ethers.keccak256(ethers.toUtf8Bytes('attestation-3'));
    const timeout = BigInt((await time.latest()) + 7200);

    await vault
      .connect(payer)
      .fundDeal(dealHash, partyTrue.address, partyFalse.address, timeout, { value: ONE_ETH });

    const nonce = await vault.settlementNonces(dealHash);
    const signature = await signSettlement(
      await vault.getAddress(),
      chainId,
      verifier,
      dealHash,
      true,
      attestationHash,
      nonce
    );

    await vault.connect(payer).settleDeal(dealHash, true, attestationHash, signature);

    await expect(vault.connect(payer).settleDeal(dealHash, true, attestationHash, signature)).to.be.revertedWithCustomError(
      vault,
      'DealAlreadyClosed'
    );
  });

  it('wrong attestation hash payload fails signature verification', async function () {
    const { vault, verifier, payer, partyTrue, partyFalse } = await deployFixture();
    const { chainId } = await ethers.provider.getNetwork();
    const dealHash = ethers.keccak256(ethers.toUtf8Bytes('deal-4'));
    const signedHash = ethers.keccak256(ethers.toUtf8Bytes('attestation-4-signed'));
    const providedHash = ethers.keccak256(ethers.toUtf8Bytes('attestation-4-provided'));
    const timeout = BigInt((await time.latest()) + 7200);

    await vault
      .connect(payer)
      .fundDeal(dealHash, partyTrue.address, partyFalse.address, timeout, { value: ONE_ETH });

    const nonce = await vault.settlementNonces(dealHash);
    const signature = await signSettlement(
      await vault.getAddress(),
      chainId,
      verifier,
      dealHash,
      true,
      signedHash,
      nonce
    );

    await expect(vault.connect(payer).settleDeal(dealHash, true, providedHash, signature)).to.be.revertedWithCustomError(
      vault,
      'InvalidSignature'
    );
  });

  it('refundAfterTimeout refunds payer only after timeout', async function () {
    const { vault, payer, partyTrue, partyFalse } = await deployFixture();
    const dealHash = ethers.keccak256(ethers.toUtf8Bytes('deal-5'));
    const timeout = BigInt((await time.latest()) + 1800);

    await vault
      .connect(payer)
      .fundDeal(dealHash, partyTrue.address, partyFalse.address, timeout, { value: ONE_ETH });

    await expect(vault.connect(payer).refundAfterTimeout(dealHash)).to.be.revertedWithCustomError(
      vault,
      'TimeoutNotReached'
    );
    await time.increase(1900);
    await expect(vault.connect(payer).refundAfterTimeout(dealHash))
      .to.emit(vault, 'DealRefunded')
      .withArgs(dealHash, payer.address, ONE_ETH);

    const deal = await vault.getDeal(dealHash);
    expect(deal.refunded).to.equal(true);
  });

  it('FALSE verdict routes payout to recipientIfFalse', async function () {
    const { vault, verifier, payer, partyTrue, partyFalse } = await deployFixture();
    const { chainId } = await ethers.provider.getNetwork();
    const dealHash = ethers.keccak256(ethers.toUtf8Bytes('deal-6'));
    const attestationHash = ethers.keccak256(ethers.toUtf8Bytes('attestation-6'));
    const timeout = BigInt((await time.latest()) + 7200);

    await vault
      .connect(payer)
      .fundDeal(dealHash, partyTrue.address, partyFalse.address, timeout, { value: ONE_ETH });

    const nonce = await vault.settlementNonces(dealHash);
    const signature = await signSettlement(
      await vault.getAddress(),
      chainId,
      verifier,
      dealHash,
      false,
      attestationHash,
      nonce
    );

    const before = await ethers.provider.getBalance(partyFalse.address);
    await vault.connect(payer).settleDeal(dealHash, false, attestationHash, signature);
    const after = await ethers.provider.getBalance(partyFalse.address);

    expect(after - before).to.equal(ONE_ETH);
  });
});
