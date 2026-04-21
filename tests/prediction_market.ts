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

  const bob = anchor.web3.Keypair.generate();

  const program = anchor.workspace.predictionMarket as Program<PredictionMarket>;

  const marketId = 1;
  const marketIdBuffer = Buffer.alloc(4);
  marketIdBuffer.writeUint32LE(marketId);

  let collateralMint: anchor.web3.PublicKey;
  let marketPda: anchor.web3.PublicKey;
  let vaultPda: anchor.web3.PublicKey;
  let outcomeAMint: anchor.web3.PublicKey;
  let outcomeBMint: anchor.web3.PublicKey;

  let bobCollateralAta: anchor.web3.PublicKey;
  let bobOutcomeAAta: anchor.web3.PublicKey;
  let bobOutcomeBAta: anchor.web3.PublicKey;

  before(async () => {
    const airdropSignature = await provider.connection.requestAirdrop(
      bob.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSignature);

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

    bobCollateralAta = getAssociatedTokenAddressSync(collateralMint, bob.publicKey);
    bobOutcomeAAta = getAssociatedTokenAddressSync(outcomeAMint, bob.publicKey);
    bobOutcomeBAta = getAssociatedTokenAddressSync(outcomeBMint, bob.publicKey);
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

    await createAssociatedTokenAccount(provider.connection, bob, collateralMint, bob.publicKey);
    await createAssociatedTokenAccount(provider.connection, bob, outcomeAMint, bob.publicKey);
    await createAssociatedTokenAccount(provider.connection, bob, outcomeBMint, bob.publicKey);

    await mintTo(provider.connection, (provider.wallet as any).payer, collateralMint, bobCollateralAta, provider.wallet.publicKey, 1000 * 10**6);

    // Run the Split
    await program.methods.splitToken(marketId, amount).accounts({
        user: bob.publicKey,
        userCollateral: bobCollateralAta,
        userOutcomeA: bobOutcomeAAta,
        userOutcomeB: bobOutcomeBAta,
        collateralVault: vaultPda,
        outcomeAMint: outcomeAMint,
        outcomeBMint: outcomeBMint,
    })
    .signers([bob]) 
    .rpc();

    // Verify balances
    const balanceA = await provider.connection.getTokenAccountBalance(bobOutcomeAAta);
    assert.equal(balanceA.value.uiAmount, 100);
    
  });

  it("User (Bob) Merges his position", async () => {
    // Merge back 50 units
    await program.methods.mergeToken(marketId).accounts({
        user: bob.publicKey,
        userCollateral: bobCollateralAta,
        userOutcomeA: bobOutcomeAAta,
        userOutcomeB: bobOutcomeBAta,
        collateralVault: vaultPda,
        outcomeAMint: outcomeAMint,
        outcomeBMint: outcomeBMint,
    })
    .signers([bob])
    .rpc();

    const balanceCollateral = await provider.connection.getTokenAccountBalance(bobCollateralAta);
    assert.equal(balanceCollateral.value.uiAmount, 1000);
  });

  it("User (Bob) Splits again for the final round", async () => {
    const amount = new anchor.BN(200 * 10**6);
    await program.methods.splitToken(marketId, amount).accounts({
        user: bob.publicKey,
        userCollateral: bobCollateralAta,
        userOutcomeA: bobOutcomeAAta,
        userOutcomeB: bobOutcomeBAta,
        collateralVault: vaultPda,
        outcomeAMint: outcomeAMint,
        outcomeBMint: outcomeBMint,
    }).signers([bob]).rpc();
  });

  it("Admin (Alice) Sets Winner", async () => {
    await program.methods.setWinningSide(marketId, { outcomeA: {} }).accounts({
        authority: provider.wallet.publicKey,
        outcomeAMint: outcomeAMint,
        outcomeBMint: outcomeBMint,
    }).rpc();
  });

  it("User (Bob) Claims Rewards", async () => {
    await program.methods.claimRewards(marketId).accounts({
        user: bob.publicKey,
        userCollateral: bobCollateralAta,
        userOutcomeA: bobOutcomeAAta,
        userOutcomeB: bobOutcomeBAta,
        collateralVault: vaultPda,
        outcomeAMint: outcomeAMint,
        outcomeBMint: outcomeBMint,
    })
    .signers([bob])
    .rpc();

    const balanceCollateral = await provider.connection.getTokenAccountBalance(bobCollateralAta);
    assert.equal(balanceCollateral.value.uiAmount, 1000); 
  });
});