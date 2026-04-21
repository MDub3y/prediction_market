import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PredictionMarket } from "../target/types/prediction_market";
import { 
  createMint, 
  mintTo, 
  getAssociatedTokenAddressSync, 
  createAssociatedTokenAccount,
  getAccount,
  TOKEN_PROGRAM_ID 
} from "@solana/spl-token";
import { assert } from "chai";

describe("prediction_market", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.predictionMarket as Program<PredictionMarket>;

  const marketId = 1;
  const marketIdBuffer = Buffer.alloc(4);
  marketIdBuffer.writeUint32LE(marketId);

  let collateralMint: anchor.web3.PublicKey;
  let marketPda: anchor.web3.PublicKey;
  let vaultPda: anchor.web3.PublicKey;
  let outcomeAMint: anchor.web3.PublicKey;
  let outcomeBMint: anchor.web3.PublicKey;

  let userCollateralAta: anchor.web3.PublicKey;
  let userOutcomeAAta: anchor.web3.PublicKey;
  let userOutcomeBAta: anchor.web3.PublicKey;

  before(async () => {
    collateralMint = await createMint(
      provider.connection,
      (provider.wallet as any).payer,
      provider.wallet.publicKey,
      null,
      6
    );

    [marketPda] = anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("market"), marketIdBuffer], program.programId);
    [vaultPda] = anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("vault"), marketIdBuffer], program.programId);
    [outcomeAMint] = anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("outcome_a"), marketIdBuffer], program.programId);
    [outcomeBMint] = anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("outcome_b"), marketIdBuffer], program.programId);

    userCollateralAta = getAssociatedTokenAddressSync(collateralMint, provider.wallet.publicKey);
    userOutcomeAAta = getAssociatedTokenAddressSync(outcomeAMint, provider.wallet.publicKey);
    userOutcomeBAta = getAssociatedTokenAddressSync(outcomeBMint, provider.wallet.publicKey);
  });

  it("Initialize Market", async () => {
    const settlementDeadline = new anchor.BN(Math.floor(Date.now() / 1000) + 3600);

    await program.methods.initializeMarket(marketId, settlementDeadline).accounts({
        authority: provider.wallet.publicKey,
        collateralMint: collateralMint,
    }).rpc();

    const marketAccount = await program.account.market.fetch(marketPda);
    assert.equal(marketAccount.marketId, marketId);
  });

  it("User Setup & Split Token", async () => {
    const amount = new anchor.BN(100 * 10**6);

    await createAssociatedTokenAccount(provider.connection, (provider.wallet as any).payer, collateralMint, provider.wallet.publicKey);
    await mintTo(provider.connection, (provider.wallet as any).payer, collateralMint, userCollateralAta, provider.wallet.publicKey, 1000 * 10**6);

    // Create User's Outcome Wallets
    await createAssociatedTokenAccount(provider.connection, (provider.wallet as any).payer, outcomeAMint, provider.wallet.publicKey);
    await createAssociatedTokenAccount(provider.connection, (provider.wallet as any).payer, outcomeBMint, provider.wallet.publicKey);

    // Run the Split
    await program.methods.splitToken(marketId, amount).accounts({
        user: provider.wallet.publicKey,
        userCollateral: userCollateralAta,
        userOutcomeA: userOutcomeAAta,
        userOutcomeB: userOutcomeBAta,
        collateralVault: vaultPda,
        outcomeAMint: outcomeAMint,
        outcomeBMint: outcomeBMint,
    }).rpc();

    // Verify balances
    const balanceA = await provider.connection.getTokenAccountBalance(userOutcomeAAta);
    const balanceCollateral = await provider.connection.getTokenAccountBalance(userCollateralAta);
    
    assert.equal(balanceA.value.uiAmount, 100);
    assert.equal(balanceCollateral.value.uiAmount, 900); // 1000 - 100
  });

  it("Merge Token", async () => {
    // Merge back 50 units
    await program.methods.mergeToken(marketId).accounts({
        user: provider.wallet.publicKey,
        userCollateral: userCollateralAta,
        userOutcomeA: userOutcomeAAta,
        userOutcomeB: userOutcomeBAta,
        collateralVault: vaultPda,
        outcomeAMint: outcomeAMint,
        outcomeBMint: outcomeBMint,
    }).rpc();

    const balanceCollateral = await provider.connection.getTokenAccountBalance(userCollateralAta);
    assert.equal(balanceCollateral.value.uiAmount, 1000);
  });

  it("Set Winner", async () => {
    // Admin settles the market for Outcome A
    await program.methods.setWinningSide(marketId, { outcomeA: {} }).accounts({
        authority: provider.wallet.publicKey,
        outcomeAMint: outcomeAMint,
        outcomeBMint: outcomeBMint,
    }).rpc();

    const marketAccount = await program.account.market.fetch(marketPda);
    assert.ok(marketAccount.isSettled);
  });

  it("Claim Rewards", async () => {
    // User claims their remaining 50 units of Outcome A
    await program.methods.claimRewards(marketId).accounts({
        user: provider.wallet.publicKey,
        userCollateral: userCollateralAta,
        userOutcomeA: userOutcomeAAta,
        userOutcomeB: userOutcomeBAta,
        collateralVault: vaultPda,
        outcomeAMint: outcomeAMint,
        outcomeBMint: outcomeBMint,
    }).rpc();

    const balanceCollateral = await provider.connection.getTokenAccountBalance(userCollateralAta);
    assert.equal(balanceCollateral.value.uiAmount, 1000); // Back to original start
  });
});