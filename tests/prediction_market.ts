import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PredictionMarket } from "../target/types/prediction_market";
import { createMint, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { assert } from "chai";

describe("prediction_market", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.predictionMarket as Program<PredictionMarket>;

  // test constants
  const marketId = 1;
  const marketIdBuffer = Buffer.alloc(4);
  marketIdBuffer.writeUint32LE(marketId);

  let collateralMint: anchor.web3.PublicKey;
  let marketPda: anchor.web3.PublicKey;

  before(async () => {
    collateralMint = await createMint(
      provider.connection,
      (provider.wallet as any).payer,
      provider.wallet.publicKey,
      null,
      6
    );

    [marketPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("market"), marketIdBuffer],
      program.programId
    );
  })

  it("Market Initialized!", async () => {
    const settlementDeadline = new anchor.BN(Math.floor(Date.now() / 1000) + 3600);

    const tx = await program.methods.initializeMarket(marketId, settlementDeadline).accounts({
        authority: provider.wallet.publicKey,
        collateralMint: collateralMint,
    }).rpc();
    console.log("Initialization TX:", tx);

    const marketAccount = await program.account.market.fetch(marketPda);

    assert.equal(marketAccount.marketId, marketId);
    assert.equal(marketAccount.authority.toBase58(), provider.wallet.publicKey.toBase58());
    assert.equal(marketAccount.isSettled, false);
    assert.equal(marketAccount.totalCollateralLocked.toNumber(), 0);
    assert.ok(marketAccount.settlementDeadline.eq(settlementDeadline));
  });
});
