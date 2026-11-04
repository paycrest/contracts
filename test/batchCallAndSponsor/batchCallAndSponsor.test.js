import { expect } from "chai";
import { ethers } from "../setup.js";

// Typed data an off-chain signer (aggregator, provision node, Paycrest signer) must produce.
const TYPES = {
  Execute: [
    { name: "calls", type: "Call[]" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
  Call: [
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "data", type: "bytes" },
  ],
};

// keccak256(abi.encode(uint256(keccak256("paycrest.storage.BatchCallAndSponsor")) - 1)) & ~bytes32(uint256(0xff))
function storageSlot() {
  const id = BigInt(ethers.id("paycrest.storage.BatchCallAndSponsor")) - 1n;
  const h = BigInt(ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [id])));
  return ethers.toBeHex(h & ~0xffn, 32);
}

describe("BatchCallAndSponsor", function () {
  let delegate; // the deployed implementation
  let runtimeCode;
  let token;
  let sponsor;
  let chainId;

  before(async function () {
    [sponsor] = await ethers.getSigners();
    delegate = await ethers.deployContract("BatchCallAndSponsor");
    runtimeCode = await ethers.provider.getCode(await delegate.getAddress());
    token = await ethers.deployContract("MockUSDT");
    chainId = (await ethers.provider.getNetwork()).chainId;
  });

  // A fresh EOA running the delegate's code at its own address: what an EIP-7702 delegation gives
  // (address(this) is the EOA, storage is the EOA's). Funded with tokens and ETH.
  async function delegatedAccount() {
    const wallet = ethers.Wallet.createRandom().connect(ethers.provider);
    await ethers.provider.send("hardhat_setCode", [wallet.address, runtimeCode]);
    await ethers.provider.send("hardhat_setBalance", [wallet.address, ethers.toBeHex(ethers.parseEther("10"))]);
    await token.connect(sponsor).transfer(wallet.address, ethers.parseUnits("1000", 18));
    const account = delegate.attach(wallet.address).connect(sponsor);
    return { wallet, account };
  }

  async function latestTimestamp() {
    return BigInt((await ethers.provider.getBlock("latest")).timestamp);
  }

  function transferCall(to, amount) {
    return { to: token.target, value: 0n, data: token.interface.encodeFunctionData("transfer", [to, amount]) };
  }

  async function sign(wallet, calls, nonce, deadline, overrides = {}) {
    const domain = {
      name: "BatchCallAndSponsor",
      version: "1",
      chainId: overrides.chainId ?? chainId,
      verifyingContract: overrides.verifyingContract ?? wallet.address,
    };
    return wallet.signTypedData(domain, TYPES, { calls, nonce, deadline });
  }

  it("executes a signed batch, emits events and consumes the nonce", async function () {
    const { wallet, account } = await delegatedAccount();
    const recipient = ethers.Wallet.createRandom().address;
    const calls = [transferCall(recipient, 5n), transferCall(recipient, 7n)];
    const deadline = (await latestTimestamp()) + 600n;
    const signature = await sign(wallet, calls, 0n, deadline);

    await expect(account.execute(calls, deadline, signature))
      .to.emit(account, "BatchExecuted")
      .and.to.emit(account, "CallExecuted");
    expect(await token.balanceOf(recipient)).to.eq(12n);
    expect(await account.nonce()).to.eq(1n);
  });

  it("matches the off-chain EIP-712 domain separator and typehashes", async function () {
    const { wallet, account } = await delegatedAccount();
    expect(await account.domainSeparator()).to.eq(
      ethers.TypedDataEncoder.hashDomain({
        name: "BatchCallAndSponsor",
        version: "1",
        chainId,
        verifyingContract: wallet.address,
      })
    );
    expect(await account.CALL_TYPEHASH()).to.eq(ethers.id("Call(address to,uint256 value,bytes data)"));
    expect(await account.EXECUTE_TYPEHASH()).to.eq(
      ethers.id("Execute(Call[] calls,uint256 nonce,uint256 deadline)Call(address to,uint256 value,bytes data)")
    );
  });

  it("keeps the nonce in the ERC-7201 slot", async function () {
    const { wallet, account } = await delegatedAccount();
    const deadline = (await latestTimestamp()) + 600n;
    for (let n = 0n; n < 2n; n++) {
      const calls = [transferCall(sponsor.address, 1n)];
      await account.execute(calls, deadline, await sign(wallet, calls, n, deadline));
    }
    expect(await account.nonce()).to.eq(2n);
    expect(BigInt(await ethers.provider.getStorage(wallet.address, storageSlot()))).to.eq(2n);
    expect(BigInt(await ethers.provider.getStorage(wallet.address, 0n))).to.eq(0n);
  });

  it("rejects a batch signed for another chain", async function () {
    const { wallet, account } = await delegatedAccount();
    const calls = [transferCall(sponsor.address, 1n)];
    const deadline = (await latestTimestamp()) + 600n;
    const signature = await sign(wallet, calls, 0n, deadline, { chainId: chainId + 1n });

    await expect(account.execute(calls, deadline, signature)).to.be.revertedWithCustomError(
      account,
      "InvalidSignature"
    );
    expect(await account.nonce()).to.eq(0n);
  });

  it("rejects a batch signed by one account when submitted to another", async function () {
    const x = await delegatedAccount();
    const y = await delegatedAccount();
    const calls = [transferCall(sponsor.address, 1n)];
    const deadline = (await latestTimestamp()) + 600n;

    // X's signature for X, relayed to Y.
    const forX = await sign(x.wallet, calls, 0n, deadline);
    await expect(y.account.execute(calls, deadline, forX)).to.be.revertedWithCustomError(
      y.account,
      "InvalidSignature"
    );
    // X signs with Y as verifyingContract: still not Y's key.
    const xForY = await sign(x.wallet, calls, 0n, deadline, { verifyingContract: y.wallet.address });
    await expect(y.account.execute(calls, deadline, xForY)).to.be.revertedWithCustomError(
      y.account,
      "InvalidSignature"
    );
  });

  it("executes at the deadline and rejects one second after", async function () {
    const { wallet, account } = await delegatedAccount();
    const calls = [transferCall(sponsor.address, 1n)];

    const deadline = (await latestTimestamp()) + 100n;
    await ethers.provider.send("evm_setNextBlockTimestamp", [Number(deadline)]);
    await expect(account.execute(calls, deadline, await sign(wallet, calls, 0n, deadline))).to.emit(
      account,
      "BatchExecuted"
    );

    const expired = (await latestTimestamp()) + 100n;
    const signature = await sign(wallet, calls, 1n, expired);
    await ethers.provider.send("evm_setNextBlockTimestamp", [Number(expired + 1n)]);
    await expect(account.execute(calls, expired, signature))
      .to.be.revertedWithCustomError(account, "Expired")
      .withArgs(expired, expired + 1n);
    expect(await account.nonce()).to.eq(1n);
  });

  it("rejects the same signature a second time", async function () {
    const { wallet, account } = await delegatedAccount();
    const calls = [transferCall(sponsor.address, 1n)];
    const deadline = (await latestTimestamp()) + 600n;
    const signature = await sign(wallet, calls, 0n, deadline);

    await account.execute(calls, deadline, signature);
    await expect(account.execute(calls, deadline, signature)).to.be.revertedWithCustomError(
      account,
      "InvalidSignature"
    );
  });

  it("rejects a deadline other than the signed one", async function () {
    const { wallet, account } = await delegatedAccount();
    const calls = [transferCall(sponsor.address, 1n)];
    const deadline = (await latestTimestamp()) + 600n;
    const signature = await sign(wallet, calls, 0n, deadline);

    await expect(account.execute(calls, deadline + 3600n, signature)).to.be.revertedWithCustomError(
      account,
      "InvalidSignature"
    );
  });

  it("rejects ProviderBatchCallAndSponsor-format signatures and calldata", async function () {
    const { wallet, account } = await delegatedAccount();
    const calls = [transferCall(sponsor.address, 1n)];
    const deadline = (await latestTimestamp()) + 600n;

    // Old digest: personal_sign(keccak256(abi.encodePacked(nonce, to, value, data, ...))).
    const packed = ethers.solidityPacked(
      ["uint256", "address", "uint256", "bytes"],
      [0n, calls[0].to, calls[0].value, calls[0].data]
    );
    const oldSignature = await wallet.signMessage(ethers.getBytes(ethers.keccak256(packed)));
    await expect(account.execute(calls, deadline, oldSignature)).to.be.revertedWithCustomError(
      account,
      "InvalidSignature"
    );

    // Old entry point execute(calls, signature): no fallback, so it reverts instead of a silent no-op.
    const oldAbi = new ethers.Interface([
      "function execute((address to,uint256 value,bytes data)[] calls, bytes signature) payable",
    ]);
    await expect(
      sponsor.sendTransaction({ to: wallet.address, data: oldAbi.encodeFunctionData("execute", [calls, oldSignature]) })
    ).to.be.revert(ethers);
    expect(await account.nonce()).to.eq(0n);
  });

  it("rejects malformed signatures", async function () {
    const { account } = await delegatedAccount();
    const calls = [transferCall(sponsor.address, 1n)];
    const deadline = (await latestTimestamp()) + 600n;
    for (const signature of ["0x", "0x1234", ethers.hexlify(new Uint8Array(65))]) {
      await expect(account.execute(calls, deadline, signature)).to.be.revertedWithCustomError(
        account,
        "InvalidSignature"
      );
    }
  });

  it("reverts the whole batch when a call fails and keeps the nonce", async function () {
    const { wallet, account } = await delegatedAccount();
    const recipient = ethers.Wallet.createRandom().address;
    const tooMuch = ethers.parseUnits("1000000", 18);
    const calls = [transferCall(recipient, 5n), transferCall(recipient, tooMuch)];
    const deadline = (await latestTimestamp()) + 600n;
    const signature = await sign(wallet, calls, 0n, deadline);

    await expect(account.execute(calls, deadline, signature))
      .to.be.revertedWithCustomError(account, "CallReverted")
      .withArgs(1n, (reason) => reason.length > 2);
    expect(await token.balanceOf(recipient)).to.eq(0n);
    expect(await account.nonce()).to.eq(0n);
  });

  it("sends ETH with a call value and accepts plain ETH", async function () {
    const { wallet, account } = await delegatedAccount();
    const recipient = ethers.Wallet.createRandom().address;
    const calls = [{ to: recipient, value: ethers.parseEther("1.5"), data: "0x" }];
    const deadline = (await latestTimestamp()) + 600n;

    await account.execute(calls, deadline, await sign(wallet, calls, 0n, deadline));
    expect(await ethers.provider.getBalance(recipient)).to.eq(ethers.parseEther("1.5"));

    const before = await ethers.provider.getBalance(wallet.address);
    await sponsor.sendTransaction({ to: wallet.address, value: 1n });
    expect(await ethers.provider.getBalance(wallet.address)).to.eq(before + 1n);
  });

  it("works through a real EIP-7702 delegation", async function () {
    const wallet = ethers.Wallet.createRandom().connect(ethers.provider);
    await ethers.provider.send("hardhat_setBalance", [wallet.address, ethers.toBeHex(ethers.parseEther("1"))]);
    await token.connect(sponsor).transfer(wallet.address, 10n);
    const recipient = ethers.Wallet.createRandom().address;
    const calls = [transferCall(recipient, 4n)];
    const deadline = (await latestTimestamp()) + 600n;
    const signature = await sign(wallet, calls, 0n, deadline);

    let authorization;
    try {
      authorization = await wallet.authorize({ address: delegate.target, nonce: 0n, chainId });
    } catch (e) {
      this.skip(); // ethers without EIP-7702 authorization support
    }
    const data = delegate.interface.encodeFunctionData("execute", [calls, deadline, signature]);
    let tx;
    try {
      tx = await sponsor.sendTransaction({ to: wallet.address, data, authorizationList: [authorization] });
    } catch (e) {
      if (/authorization|7702|type 4|SetCode/i.test(String(e))) this.skip(); // network without EIP-7702
      throw e;
    }
    await tx.wait();

    expect(await ethers.provider.getCode(wallet.address)).to.eq(
      ethers.concat(["0xef0100", delegate.target]).toLowerCase()
    );
    expect(await token.balanceOf(recipient)).to.eq(4n);
    expect(await delegate.attach(wallet.address).nonce()).to.eq(1n);
  });
});
