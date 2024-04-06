import * as anchor from "@coral-xyz/anchor";
import * as assert from "assert";
import { Program, BorshAccountsCoder } from "@coral-xyz/anchor";
import { Biscuit } from "../target/types/biscuit";
import metadata_idl from "../idl/token_metadata.json";
// import { Metaplex } from "@metaplex-foundation/js";
import {
  createMint,
  createAccount,
  getAccount,
  getOrCreateAssociatedTokenAccount,
  createAssociatedTokenAccountInstruction,
  transfer,
  mintTo,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID, createWrappedNativeAccount, NATIVE_MINT, getAssociatedTokenAddress, createAssociatedTokenAccount, createTransferInstruction
} from "@solana/spl-token";
import { BN } from "bn.js";
import { ComputeBudgetInstruction, ComputeBudgetProgram, Keypair, PublicKey, Signer, Transaction, } from "@solana/web3.js";
import {
  MPL_TOKEN_METADATA_PROGRAM_ID,
  findMetadataPda,
  Metadata,
  deserializeMasterEdition,
  deserializeMetadata,
  transferV1,
  getMetadataAccountDataSerializer,
  TransferV1InstructionArgs,
  TransferV1InstructionAccounts,
  getTransferV1InstructionDataSerializer,
  TokenStandard
} from "@metaplex-foundation/mpl-token-metadata";
import {
  ORCA_WHIRLPOOL_PROGRAM_ID, ORCA_WHIRLPOOLS_CONFIG,
  PDAUtil, SwapUtils,
  WhirlpoolContext, buildWhirlpoolClient, TickUtil, PriceMath, swapQuoteByInputToken,
  toTx,
  TickArrayUtil,
  PoolUtil,
  increaseLiquidityQuoteByInputTokenUsingPriceSlippage,
} from "@orca-so/whirlpools-sdk"
import Decimal from "decimal.js";
import { getCollectionAddresses } from "./helpers/collection";
import { getNftAddresses } from "./helpers/nft";
import { expect } from "chai";
import { MathUtil, PDA, Percentage } from "@orca-so/common-sdk";
import { increaseLiquidityIx, initTickArrayIx, openPositionIx, openPositionWithMetadataIx, swapIx } from "@orca-so/whirlpools-sdk/dist/instructions";
import { token } from "@coral-xyz/anchor/dist/cjs/utils";
import { DecimalUtil } from "@orca-so/whirlpool-sdk";
const tokens = {
  USDT: {
    key: new PublicKey('Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'),
  },
  USDC: {
    key: new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')
  },
  JUP: {
    key: new PublicKey('JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN')
  },
  SOL: {
    key: new PublicKey('So11111111111111111111111111111111111111112')
  }
}


const WHIRLPOOLS = {
  [tokens.SOL.key.toString()]: {
    [tokens.USDC.key.toString()]: { key: new PublicKey('83v8iPyZihDEjDdY8RdZddyZNyUtXngz69Lgo9Kt5d6d') },
    [tokens.USDT.key.toString()]: { key: new PublicKey("FwewVm8u6tFPGewAyHmWAqad9hmF7mvqxK4mJ7iNqqGC") },
    [tokens.JUP.key.toString()]: { key: new PublicKey('DkVN7RKTNjSSER5oyurf3vddQU2ZneSCYwXvpErvTCFA'), invert: true },
  },
}


describe("biscuit", () => {

  const collection_data = {
    title: "Portfolio#1",
    symbol: "PRT1",
    uri: "https://raw.githubusercontent.com/Coding-and-Crypto/Solana-NFT-Marketplace/master/assets/example.json"
  }
  const treasury = anchor.web3.Keypair.generate();
  const portfolioMintKeypair: anchor.web3.Keypair = anchor.web3.Keypair.generate();
  const wpoolOwn = anchor.web3.Keypair.generate();
  const portfolioTokens = [
    {
      key: tokens.USDC.key,
      percent: 500
    },
    {
      key: tokens.USDT.key,
      percent: 300
    },
    {
      key: tokens.JUP.key,
      percent: 200
    }
  ]

  const paymentToken = {
    keyPair: anchor.web3.Keypair.generate(),
  }

  const users = new Array(3).fill(0).map(() => anchor.web3.Keypair.generate());

  const provider = anchor.AnchorProvider.env()
  const wallet = provider.wallet as anchor.Wallet;


  const program = anchor.workspace.Biscuit as Program<Biscuit>;
  const config_address = anchor.web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from("config"),
    ],
    program.programId
  )[0];

  const TOKEN_METADATA_PROGRAM_ID = new anchor.web3.PublicKey(
    "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
  );


  const whirlpool_ctx = WhirlpoolContext.withProvider(provider, ORCA_WHIRLPOOL_PROGRAM_ID);
  const fetcher = whirlpool_ctx.fetcher;
  let portfolio_lookup_table;
  let treasury_ata_sol: PublicKey;

  async function getWhirlpool(whirlpool_pubkey: PublicKey, token_a: PublicKey, token_b: PublicKey, amount: anchor.BN, invert: boolean) {
    // const whirlpool_pubkey = PDAUtil.getWhirlpool(ORCA_WHIRLPOOL_PROGRAM_ID, ORCA_WHIRLPOOLS_CONFIG, token_a, token_b, 1).publicKey;
    const whirlpool_oracle_pubkey = PDAUtil.getOracle(ORCA_WHIRLPOOL_PROGRAM_ID, whirlpool_pubkey).publicKey;
    const whirlpool = await fetcher.getPool(whirlpool_pubkey);
    if (!whirlpool) {
      throw new Error('Invalid pool');
    }

    const other_amount_threshold = new anchor.BN(0);
    const amount_specified_is_input = true;
    const a_to_b = !invert;
    const sqrt_price_limit = SwapUtils.getDefaultSqrtPriceLimit(a_to_b);

    const tickarrays = SwapUtils.getTickArrayPublicKeys(
      whirlpool.tickCurrentIndex,
      whirlpool.tickSpacing,
      a_to_b,
      ORCA_WHIRLPOOL_PROGRAM_ID,
      whirlpool_pubkey
    );

    const args = {
      amount: amount,
      other_amount_threshold,
      sqrt_price_limit,
      amount_specified_is_input,
      a_to_b,
    }

    const accounts = {
      whirlpool: whirlpool_pubkey,
      tokenVaultA: whirlpool.tokenVaultA,
      tokenVaultB: whirlpool.tokenVaultB,
      tickArray0: tickarrays[0],
      tickArray1: tickarrays[1],
      tickArray2: tickarrays[2],
      oracle: whirlpool_oracle_pubkey,
    }

    return { args, accounts };
  }

  async function getPortfolioSwapData(
    payer: PublicKey,
    amountIn: anchor.BN,
    paymen_token: PublicKey,
    tokens_data: Array<{ key: PublicKey, percent: number }>,
    nft_mint: PublicKey,
    forTableCreation = false
  ) {
    const result = {
      args: {
        amount: [],
        other_amount_threshold: [],
        sqrt_price_limit: [],
        amount_specified_is_input: [],
        a_to_b: [],
      },
      accounts: [],
      instructionsForAta: [],
      ata: [],
    }

    for (const token of tokens_data) {

      const associatedToken = getAssociatedTokenAddressSync(
        token.key,
        nft_mint,
        true,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      result.instructionsForAta.push(
        createAssociatedTokenAccountInstruction(
          payer,
          associatedToken,
          nft_mint,
          token.key,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      );

      result.ata.push(associatedToken);

      const amount = amountIn.mul(new anchor.BN(token.percent)).div(new anchor.BN(1000));
      const whirlpool_pubkey = WHIRLPOOLS[paymen_token.toString()][token.key.toString()];
      const data = await getWhirlpool(whirlpool_pubkey.key, paymen_token, token.key, amount, whirlpool_pubkey.invert);

      if (!forTableCreation) {
        result.accounts.push(associatedToken);
      }
      result.accounts.push(data.accounts.tokenVaultA);
      result.accounts.push(data.accounts.tokenVaultB);
      result.accounts.push(data.accounts.tickArray0);
      result.accounts.push(data.accounts.tickArray1);
      result.accounts.push(data.accounts.tickArray2);
      result.accounts.push(data.accounts.oracle);
      result.accounts.push(data.accounts.whirlpool);

      for (const key in result.args) {
        if (Object.prototype.hasOwnProperty.call(result.args, key)) {
          result.args[key].push(data.args[key]);
        }
      }
    }

    return result;
  }

  async function createAndSendV0Tx(
    txInstructions: anchor.web3.TransactionInstruction[],
    payer: Signer,
    addressLookupTable: PublicKey | undefined = undefined
  ) {
    // Step 1 - Fetch the latest blockhash
    let latestBlockhash = await provider.connection.getLatestBlockhash(
      "confirmed"
    );
    console.log(
      "   ✅ - Fetched latest blockhash. Last Valid Height:",
      latestBlockhash.lastValidBlockHeight
    );

    // Step 2 - Generate Transaction Message
    let messageV0;
    if (addressLookupTable) {
      const lookupTableAccount = (
        await provider.connection.getAddressLookupTable(addressLookupTable)
      ).value;
      messageV0 = new anchor.web3.TransactionMessage({
        payerKey: payer.publicKey,
        recentBlockhash: latestBlockhash.blockhash,
        instructions: txInstructions,
      }).compileToV0Message([lookupTableAccount]);
      // console.log(messageV0)
    } else {
      messageV0 = new anchor.web3.TransactionMessage({
        payerKey: payer.publicKey,
        recentBlockhash: latestBlockhash.blockhash,
        instructions: txInstructions,
      }).compileToV0Message();
    }



    console.log("   ✅ - Compiled Transaction Message");
    const transaction = new anchor.web3.VersionedTransaction(messageV0);

    // Step 3 - Sign your transaction with the required `Signers`
    transaction.sign([payer]);
    // provider.wallet.signTransaction(transaction);
    console.log("   ✅ - Transaction Signed");

    // Step 4 - Send our v0 transaction to the cluster
    const txid = await provider.connection.sendTransaction(transaction, {
      maxRetries: 5,
    }).catch(err => {
      console.error(err)
      if (err.logs) {
        err.logs.forEach(element => {
          console.error(element)
        });
      }
      throw new Error(err)
    });
    console.log("   ✅ - Transaction sent to network");

    // Step 5 - Confirm Transaction
    const confirmation = await provider.connection.confirmTransaction({
      signature: txid,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    });
    // provider.connection.lo
    if (confirmation.value.err) {
      throw new Error(
        `   ❌ - Transaction not confirmed.\nReason: ${confirmation.value.err}`
      );
    }

    console.log("🎉 Transaction Successfully Confirmed!");
    // let result = await program.account.actionState.fetch(actionState);
    // console.log("Robot action state details: ", result);
  }

  // let portfolio_collection;

  before(async () => {
    await provider.connection.requestAirdrop(wpoolOwn.publicKey, 10000000000);
    await provider.connection.requestAirdrop(portfolioMintKeypair.publicKey, 1000000000);
    await provider.connection.requestAirdrop(users[0].publicKey, 10000000000);
    await provider.connection.requestAirdrop(users[1].publicKey, 10000000000);
    await provider.connection.requestAirdrop(users[2].publicKey, 10000000000);


    await createMint(provider.connection, wallet.payer, wallet.publicKey, wallet.publicKey, 9, paymentToken.keyPair, {}, TOKEN_PROGRAM_ID)
    const user1ATA = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      wallet.payer,
      paymentToken.keyPair.publicKey,
      users[0].publicKey
    );

    await mintTo(
      provider.connection,
      wallet.payer as Signer,
      paymentToken.keyPair.publicKey,
      user1ATA.address,
      wallet.payer,
      99000000000,
      [],
      {},
      TOKEN_PROGRAM_ID
    );
    await delay(5000)
    await createPools();
  })

  const delay = (delayInms) => {
    return new Promise(resolve => setTimeout(resolve, delayInms));
  };


  /// --------------------------------------------------------------------------------



  it("Initialize", async () => {

    const tx = await program.methods.initialize(
      new anchor.BN(9999),
      treasury.publicKey
    ).accounts({
      config: config_address,
      payer: wallet.publicKey
    }).signers([wallet.payer]).rpc();


    treasury_ata_sol = (await getOrCreateAssociatedTokenAccount(
      provider.connection,
      wallet.payer,
      NATIVE_MINT,
      treasury.publicKey
    )).address;
  })

  it("Create portfolio", async () => {
    const portfolio_id = 1;

    const portfolio_collection = getCollectionAddresses(portfolio_id);

    const tx = await program.methods.createPortfolio(
      portfolio_id,
      collection_data.uri,
      portfolioTokens.map(e => e.key),
      Buffer.from(portfolioTokens.map(e => e.percent)),
      50,
      100
    )
      .accounts({
        config: config_address,
        signer: wallet.publicKey,
        mint: portfolio_collection.collection_mint,
        metadata: portfolio_collection.collection_metadata,
        masterEdition: portfolio_collection.collection_master_edition,
        onchainData: portfolio_collection.collection_onchain_data,
        mplProgram: TOKEN_METADATA_PROGRAM_ID,
        sysvarInstructions: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
      }).signers([wallet.payer]).rpc().catch(e => console.error(e));

    const potrfolio = await program.account.portfolioCollectionData.fetch(portfolio_collection.collection_onchain_data);

    const wrpool = await getPortfolioSwapData(users[0].publicKey, new anchor.BN(0), tokens.SOL.key, portfolioTokens, portfolio_collection.collection_mint, true);
    const slot = await provider.connection.getSlot() - 1;
    const [lookupTableInst, lookupTableAddress] =
      anchor.web3.AddressLookupTableProgram.createLookupTable({
        authority: wallet.publicKey,
        payer: wallet.publicKey,
        recentSlot: slot,
      });

    const extendInstruction = anchor.web3.AddressLookupTableProgram.extendLookupTable({
      payer: wallet.publicKey,
      authority: wallet.publicKey,
      lookupTable: lookupTableAddress,
      addresses: [
        portfolio_collection.collection_mint,
        portfolio_collection.collection_metadata,
        portfolio_collection.collection_master_edition,
        portfolio_collection.collection_onchain_data,
        ...wrpool.accounts]
    });

    await createAndSendV0Tx([lookupTableInst, extendInstruction], wallet.payer);
    await delay(5000);
    portfolio_lookup_table = lookupTableAddress;
  });

  it("Fail: buy portfolio with invalid id", async () => {
    const portfolio_id = 1;
    const nft_id = 2;

    const portfolio_collection = getCollectionAddresses(portfolio_id);
    const userWSOL = await createWrappedNativeAccount(provider.connection, users[2], users[2].publicKey, 5000000000, undefined, {}, TOKEN_PROGRAM_ID);
    const nft = getNftAddresses(portfolio_collection.collection_mint, nft_id, users[2].publicKey);
    const amount = new anchor.BN(1000000000);
    const wrpool = await getPortfolioSwapData(users[2].publicKey, amount, tokens.SOL.key, portfolioTokens, nft.nft_mint);

    const additionalComputeBudgetInstruction =
      ComputeBudgetProgram.setComputeUnitLimit({
        units: 600000,
      });

    // Create ATAs for NFT
    await createAndSendV0Tx(wrpool.instructionsForAta, users[2])


    const instruction = await program.methods.buyPortfolio(
      nft_id,
      portfolio_id,
      collection_data.uri,
      amount,
      wrpool.args.other_amount_threshold,
      wrpool.args.sqrt_price_limit,
      wrpool.args.amount_specified_is_input,
      wrpool.args.a_to_b
    )
      .accounts({
        treasuryAta: treasury_ata_sol,
        config: config_address,
        payer: users[2].publicKey,
        paymentTokenAccount: userWSOL,
        collection: portfolio_collection.collection_mint,
        collectionMetadata: portfolio_collection.collection_metadata,
        collectionMasterEdition: portfolio_collection.collection_master_edition,
        collectionOnchaindata: portfolio_collection.collection_onchain_data,
        tokenMint: nft.nft_mint,
        nftUserTokenAccount: nft.nft_ata,
        nftRecord: nft.nft_record,
        portfolioData: nft.nft_onchain_data,
        metadataAccount: nft.nft_metadata,
        masterEditionAccount: nft.nft_master_edition,
        whirlpoolProgram: ORCA_WHIRLPOOL_PROGRAM_ID,
        mplProgram: TOKEN_METADATA_PROGRAM_ID,
        sysvarInstructions: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        splAtaProgram: ASSOCIATED_TOKEN_PROGRAM_ID
      }).signers([users[2]])
      .remainingAccounts(wrpool.accounts.map(e => {
        return { pubkey: e, isSigner: false, isWritable: true };
      })).instruction()

    // console.log(instruction)

    try {
      await createAndSendV0Tx(
        [
          additionalComputeBudgetInstruction,
          instruction
        ],
        users[2],
        portfolio_lookup_table
      )
      assert.fail("should fail because collection size is 0");
    } catch (e) {
      const error = e as Error;
      console.log(error.message);
      assert.match(error.message, /0x1773/); // SqrtPriceOutOfBounds
    }
  })

  it("Buy portfolio by SOL", async () => {
    const portfolio_id = 1;
    const nft_id = 1;

    const portfolio_collection = getCollectionAddresses(portfolio_id);
    const deser = getMetadataAccountDataSerializer();
    const d1 = await provider.connection.getAccountInfo(portfolio_collection.collection_metadata);
    console.log(deser.deserialize(d1.data)[0].collectionDetails)
    const userWSOL = await createWrappedNativeAccount(provider.connection, users[0], users[0].publicKey, 5000000000, undefined, {}, TOKEN_PROGRAM_ID);

    const nft = getNftAddresses(portfolio_collection.collection_mint, nft_id, users[0].publicKey);
    const amount = new anchor.BN(1000000000);
    const wrpool = await getPortfolioSwapData(users[0].publicKey, amount, tokens.SOL.key, portfolioTokens, nft.nft_mint);

    const additionalComputeBudgetInstruction =
      ComputeBudgetProgram.setComputeUnitLimit({
        units: 600000,
      });

    // Create ATAs for NFT
    await createAndSendV0Tx(wrpool.instructionsForAta, users[0])
    // console.log(portfolio_collection);
    // console.log(nft)
    const instruction = await program.methods.buyPortfolio(
      nft_id,
      portfolio_id,
      collection_data.uri,
      amount,
      wrpool.args.other_amount_threshold,
      wrpool.args.sqrt_price_limit,
      wrpool.args.amount_specified_is_input,
      wrpool.args.a_to_b
    )
      .accounts({
        treasuryAta: treasury_ata_sol,
        config: config_address,
        payer: users[0].publicKey,
        paymentTokenAccount: userWSOL,
        collection: portfolio_collection.collection_mint,
        collectionMetadata: portfolio_collection.collection_metadata,
        collectionMasterEdition: portfolio_collection.collection_master_edition,
        collectionOnchaindata: portfolio_collection.collection_onchain_data,
        tokenMint: nft.nft_mint,
        nftUserTokenAccount: nft.nft_ata,
        nftRecord: nft.nft_record,
        portfolioData: nft.nft_onchain_data,
        metadataAccount: nft.nft_metadata,
        masterEditionAccount: nft.nft_master_edition,
        whirlpoolProgram: ORCA_WHIRLPOOL_PROGRAM_ID,
        mplProgram: TOKEN_METADATA_PROGRAM_ID,
        sysvarInstructions: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        splAtaProgram: ASSOCIATED_TOKEN_PROGRAM_ID
      }).signers([users[0]])
      .remainingAccounts(wrpool.accounts.map(e => {
        return { pubkey: e, isSigner: false, isWritable: true };
      })).instruction()

    // console.log(instruction)
    await createAndSendV0Tx(
      [
        additionalComputeBudgetInstruction,
        instruction
      ],
      users[0],
      portfolio_lookup_table
    )

    for (const ata of wrpool.ata) {
      console.log(await provider.connection.getTokenAccountBalance(ata))
    }

    const d2 = await provider.connection.getAccountInfo(portfolio_collection.collection_metadata);

    // deser.de
    console.log(deser.deserialize(d2.data)[0].collectionDetails)
  })

  it("Transfer NFT", async () => {
    const portfolio_id = 1;
    const nft_id = 1;

    const portfolio_collection = getCollectionAddresses(portfolio_id);
    const nft = getNftAddresses(portfolio_collection.collection_mint, nft_id, users[0].publicKey);

    const nft_user2_ata = (await getOrCreateAssociatedTokenAccount(
      provider.connection,
      wallet.payer,
      nft.nft_mint,
      users[1].publicKey
    )).address;

    console.log(await provider.connection.getAccountInfo(nft.nft_ata));
    console.log(await provider.connection.getAccountInfo(nft_user2_ata))

    const instruction = createTransferInstruction(
      nft.nft_ata,
      nft_user2_ata,
      users[0].publicKey,
      1
    );

    await createAndSendV0Tx([instruction], users[0])
    console.log(await provider.connection.getTokenAccountBalance(nft.nft_ata))
    console.log(await provider.connection.getTokenAccountBalance(nft_user2_ata))
  })

  it("Burn portfolio", async () => {
    const portfolio_id = 1;
    const nft_id = 1;
    const portfolio_collection = getCollectionAddresses(portfolio_id);
    const nft = getNftAddresses(portfolio_collection.collection_mint, nft_id, users[1].publicKey);
    const deser = getMetadataAccountDataSerializer();
    const atasInstructions = []
    const atas = []

    for (const token of portfolioTokens) {
      const userAta = getAssociatedTokenAddressSync(
        token.key,
        users[1].publicKey,
        true,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      const portfolioAta = getAssociatedTokenAddressSync(
        token.key,
        nft.nft_mint,
        true,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      atasInstructions.push(
        createAssociatedTokenAccountInstruction(
          users[1].publicKey,
          userAta,
          users[1].publicKey,
          token.key,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      );
      atas.push(portfolioAta);
      atas.push(userAta);
    }

    const additionalComputeBudgetInstruction =
      ComputeBudgetProgram.setComputeUnitLimit({
        units: 200000,
      });
    await createAndSendV0Tx(atasInstructions, users[1])


    console.log(await provider.connection.getAccountInfo(nft.nft_metadata));
    console.log(await provider.connection.getAccountInfo(nft.nft_mint));
    console.log(await provider.connection.getAccountInfo(nft.nft_ata));
    console.log(await provider.connection.getAccountInfo(nft.nft_record));
    console.log(await provider.connection.getAccountInfo(nft.nft_master_edition));


    // for (const acc of accs) {
    //   console.log(await provider.connection.getAccountInfo(acc))
    // }

    const instruction = await program.methods.burnPortfolio(nft_id).accounts({
      treasuryAta: treasury_ata_sol,
      config: config_address,
      payer: users[1].publicKey,
      collection: portfolio_collection.collection_mint,
      collectionMetadata: portfolio_collection.collection_metadata,
      collectionMasterEdition: portfolio_collection.collection_master_edition,
      collectionOnchaindata: portfolio_collection.collection_onchain_data,
      tokenMint: nft.nft_mint,
      nftUserTokenAccount: nft.nft_ata,
      nftRecord: nft.nft_record,
      metadataAccount: nft.nft_metadata,
      masterEditionAccount: nft.nft_master_edition,
      mplProgram: TOKEN_METADATA_PROGRAM_ID,
      sysvarInstructions: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
      splAtaProgram: ASSOCIATED_TOKEN_PROGRAM_ID
    }).signers([users[1]])
      .remainingAccounts(atas.map(e => {
        return { pubkey: e, isSigner: false, isWritable: true };
      })).instruction()

    await createAndSendV0Tx(
      [
        additionalComputeBudgetInstruction,
        instruction
      ],
      users[1],
      portfolio_lookup_table
    )

    for (const ata of atas) {
      // console.log()
      try {
        await provider.connection.getTokenAccountBalance(ata);
        assert.fail('shoud faild bcs ata doesnt exists');
      } catch (e) {
        const error = e as Error;
        assert.match(error.message, /could not find account/); // SqrtPriceOutOfBounds
      }
    }

    const d2 = await provider.connection.getAccountInfo(portfolio_collection.collection_metadata);

    // deser.de
    console.log(deser.deserialize(d2.data)[0].collectionDetails)

  })

  it.skip("Buy portfolio by Token", async () => {

    const user1ATA = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      wallet.payer,
      paymentToken.keyPair.publicKey,
      users[0].publicKey
    );
    const userTokenAccount = await provider.connection.getTokenAccountBalance(user1ATA.address);
    // console.log(userTokenAccount)
    const programATA = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      wallet.payer,
      paymentToken.keyPair.publicKey,
      program.programId
    );
    const programTokenAccount = await provider.connection.getTokenAccountBalance(programATA.address);
    console.log(programTokenAccount)


    const nft_id = 1;
    const nft = await getNftAddresses(portfolio_collection.tokenAccount, nft_id);


    console.log(nft)
    // await createAssociatedTokenAccount(
    //   provider.connection,
    //   users[0],
    //   nft.tokenAccount,
    //   users[0].publicKey,
    //   {},
    //   TOKEN_PROGRAM_ID,
    //   ASSOCIATED_TOKEN_PROGRAM_ID
    // )

    let tx = new Transaction();
    const additionalComputeBudgetInstruction =
      ComputeBudgetProgram.setComputeUnitLimit({
        units: 400000,
      });
    // console.log(user1ATANFT)
    const buyInstruction = await program.methods.buyPortfolio(
      nft_id,
      collection_data.uri,
      new anchor.BN(4000000000),
    )
      .accounts({
        payer: users[0].publicKey,
        nftUserTokenAccount: nft.nftATA,
        nftRecord: nft.nftRecord,
        portfolioData: nft.onchainDataAddress,
        tokenMint: nft.tokenAccount,
        metadataAccount: nft.metadataAccountAddress,
        masterEditionAccount: nft.masterEditionAccountAddress,
        collectionMetadata: portfolio_collection.onchainDataAddress,
        collection: portfolio_collection.tokenAccount,
        paymentToken: paymentToken.keyPair.publicKey,
        mplProgram: TOKEN_METADATA_PROGRAM_ID,
        sysvarInstructions: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        paymentUserTokenAccount: user1ATA.address,
        paymentProgramTokenAccount: programATA.address,
        splAtaProgram: ASSOCIATED_TOKEN_PROGRAM_ID
      }).signers([users[0]])
      .preInstructions([additionalComputeBudgetInstruction])
      .rpc().catch(e => console.error(e));


    const accounts = await provider.connection.getTokenAccountsByOwner(users[0].publicKey, {
      programId: TOKEN_PROGRAM_ID
    });

    // console.log(accounts)

    // Metadata.
    // )
    // )
    // .instruction()

    // tx.add(buyInstruction);
    // await provider.connection.sendTransaction(tx, [users[0]]).catch(err=>console.error(err));
    // 

    // const mintInstruction = await program.methods.mintPortfolio(
    //   nft_id
    // ).accounts({
    //   payer: users[0].publicKey,
    //   nftUserTokenAccount: user1ATANFT,
    //   authority: portfolioMintKeypair.publicKey,
    //   portfolioData: nft.onchainDataAddress,
    //   tokenMint: nft.tokenAccount,
    //   metadataAccount: nft.metadataAccountAddress,
    //   masterEditionAccount: nft.masterEditionAccountAddress,
    //   collectionMetadata: portfolio_collection.onchainDataAddress,
    //   collection: portfolio_collection.tokenAccount,
    //   paymentToken: paymentToken.keyPair.publicKey,
    //   mplProgram: TOKEN_METADATA_PROGRAM_ID,
    //   sysvarInstructions: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
    //   splAtaProgram: ASSOCIATED_TOKEN_PROGRAM_ID
    // }).signers([users[0]]).instruction()

    // tx.add(buyInstruction);
    // tx.add(mintInstruction)

    // await provider.connection.sendTransaction(tx, [users[0]]).catch(err=>console.error(err));


    // .rpc().catch(e => console.error(e));

    const userTokenAccount2 = await provider.connection.getTokenAccountBalance(user1ATA.address);
    console.log(userTokenAccount2)
    const programTokenAccount2 = await provider.connection.getTokenAccountBalance(programATA.address);
    console.log(programTokenAccount2)
    // console.log(program)
    // const potrfolio = await program.account.portfolioCollectionData.fetch(portfolio_collection.onchainDataAddress);
    // console.log("Portfolio: ", potrfolio);
    // const nft_metadata =  await program.provider.connection.getAccountInfo(nft.metadataAccountAddress)
    // console.log(metaplex)
    // dese
    // console.log("Metadata: ", deserializeMetadata(nft_metadata) )
    // const nft_onchain_data = await program.account.portfolioData.fetch(nft.onchainDataAddress);
    // console.log("Onchain: ", nft_onchain_data)
    // const nft_mint = 
    // const nft_master_edition = 

  })


});


/*
    let tx = new Transaction();

    console.log(user1ATANFT)
    const buyInstruction = await program.methods.buyPortfolio(
      nft_id,
      collection_data.uri,
      new anchor.BN(4000000000),
    )
    .accounts({
      payer: users[0].publicKey,
      nftUserTokenAccount: user1ATANFT,
      authority: portfolioMintKeypair.publicKey,
      portfolioData: nft.onchainDataAddress,
      tokenMint: nft.tokenAccount,
      metadataAccount: nft.metadataAccountAddress,
      masterEditionAccount: nft.masterEditionAccountAddress,
      collectionMetadata: portfolio_collection.onchainDataAddress,
      collection: portfolio_collection.tokenAccount,
      paymentToken: paymentToken.keyPair.publicKey,
      mplProgram: TOKEN_METADATA_PROGRAM_ID,
      sysvarInstructions: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
      paymentUserTokenAccount: user1ATA.address,
      paymentProgramTokenAccount: programATA.address,
      splAtaProgram: ASSOCIATED_TOKEN_PROGRAM_ID
    }).signers([users[0]]).instruction();

    const mintInstruction = await program.methods.mintPortfolio(
      nft_id
    ).accounts({
      payer: users[0].publicKey,
      nftUserTokenAccount: user1ATANFT,
      authority: portfolioMintKeypair.publicKey,
      portfolioData: nft.onchainDataAddress,
      tokenMint: nft.tokenAccount,
      metadataAccount: nft.metadataAccountAddress,
      masterEditionAccount: nft.masterEditionAccountAddress,
      collectionMetadata: portfolio_collection.onchainDataAddress,
      collection: portfolio_collection.tokenAccount,
      paymentToken: paymentToken.keyPair.publicKey,
      mplProgram: TOKEN_METADATA_PROGRAM_ID,
      sysvarInstructions: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
      splAtaProgram: ASSOCIATED_TOKEN_PROGRAM_ID
    }).signers([users[0]]).instruction()

    tx.add(buyInstruction);
    tx.add(mintInstruction)

    await provider.connection.sendTransaction(tx, [users[0]]).catch(err=>console.error(err));

  */