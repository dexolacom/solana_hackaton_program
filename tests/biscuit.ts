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
import { createAndMintToken, mintTokens } from "./helpers/createAndMint";
import { createTestPool } from "./helpers/createPool";
import { expect } from "chai";
import { MathUtil, PDA, Percentage } from "@orca-so/common-sdk";
import { increaseLiquidityIx, initTickArrayIx, openPositionIx, openPositionWithMetadataIx, swapIx } from "@orca-so/whirlpools-sdk/dist/instructions";
import { token } from "@coral-xyz/anchor/dist/cjs/utils";
import { DecimalUtil } from "@orca-so/whirlpool-sdk";
import { keypairPayer } from "@metaplex-foundation/umi";
// const tokens = {
//   USDT: {
//     key: new PublicKey('Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'),
//   },
//   USDC: {
//     key: new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')
//   },
//   JUP: {
//     key: new PublicKey('JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN')
//   },
//   SOL: {
//     key: new PublicKey('So11111111111111111111111111111111111111112')
//   }
// }


// const WHIRLPOOLS = {
//   [tokens.SOL.key.toString()]: {
//     [tokens.USDC.key.toString()]: { key: new PublicKey('83v8iPyZihDEjDdY8RdZddyZNyUtXngz69Lgo9Kt5d6d') },
//     [tokens.USDT.key.toString()]: { key: new PublicKey("FwewVm8u6tFPGewAyHmWAqad9hmF7mvqxK4mJ7iNqqGC") },
//     [tokens.JUP.key.toString()]: { key: new PublicKey('DkVN7RKTNjSSER5oyurf3vddQU2ZneSCYwXvpErvTCFA'), invert: true },
//   },
// }
// const prices = []
// const decimals = [8,8,9,6,8,8,5,6];
// const percenages = [
//   300, 200, 150, 100, 100, 50, 50, 50
// ];
function comparePublicKeys(a: Keypair, b: Keypair): number {
  return PoolUtil.compareMints(a.publicKey, b.publicKey);
  // const bytesA = a.publicKey.toBase58()
  // const bytesB = b.publicKey.toBase58();

  // return bytesA.localeCompare(bytesB)
  // for (let i = bytesA.length - 1; i >= 0; i--) {
  //     if (bytesA[i] !== bytesB[i]) {
  //         return bytesA[i] > bytesB[i];
  //     }
  // }

  // return 0;
}

function sortPublicKeys(publicKeys: Keypair[]): Keypair[] {
  return publicKeys.sort(comparePublicKeys);
}

const tokens = new Array(9).fill(0).map(e => Keypair.generate())
const tokensSorted = sortPublicKeys(tokens);

const payment_token = {
  keyPair: tokensSorted[tokensSorted.length-1],
  key: tokensSorted[tokensSorted.length-1].publicKey,
  decimals: 6
}

const tokens_data = [
  {
    // keyPair: Keypair.generate(), // BTC
    percent: 300,
    decimals: 8,
    price: 67476.24
  },
  {
    // key: new PublicKey("So11111111111111111111111111111111111111112"), // SOL
    percent: 200,
    decimals: 9,
    price: 175.32
  },
  {
    // keyPair: Keypair.generate(), // ETH
    percent: 150,
    decimals: 8,
    price: 3313
  },
  {
    // keyPair: Keypair.generate(), // JUP
    percent: 100,
    decimals: 6,
    price: 1.373
  },
  {
    // keyPair: Keypair.generate(), // RNDR
    percent: 100,
    decimals: 8,
    price: 9.08339
  },
  {
    // keyPair: Keypair.generate(), // HNT
    percent: 50,
    decimals: 8,
    price: 5.6246415
  },
  {
    // keyPair: Keypair.generate(), // BONK
    percent: 50,
    decimals: 5,
    price: 0.00002183749
  },
  {
    // keyPair: Keypair.generate(), // PYTH
    percent: 50,
    decimals: 6,
    price: 1.23424
  }
]

const portfolio_tokens = [];

for (let i = 0; i < 8; i++) {
   let keyPair = tokensSorted[i];
  portfolio_tokens.push({
    ...tokens_data[i],
    keyPair,
    key: keyPair.publicKey
  })

}

const collection_data = {
  title: "Portfolio#1",
  symbol: "PRT1",
  uri: "https://raw.githubusercontent.com/Coding-and-Crypto/Solana-NFT-Marketplace/master/assets/example.json"
}

describe("biscuit", () => {

  const treasury = anchor.web3.Keypair.generate();

  const users = new Array(3).fill(0).map(() => anchor.web3.Keypair.generate());
  const mint_amount = 1_000_000_000_000_000;
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
      const whirlpool_pubkey = PDAUtil.getWhirlpool(ORCA_WHIRLPOOL_PROGRAM_ID, ORCA_WHIRLPOOLS_CONFIG,  token.key, paymen_token, 128).publicKey;
      const data = await getWhirlpool(whirlpool_pubkey, paymen_token, token.key, amount, true);

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

  async function createTable(accounts: PublicKey[], signer: Signer) {
    
    const slot = await provider.connection.getSlot() - 1;
    const [lookupTableInst, lookupTableAddress] =
      anchor.web3.AddressLookupTableProgram.createLookupTable({
        authority: signer.publicKey,
        payer: signer.publicKey,
        recentSlot: slot,
      });

    await createAndSendV0Tx([lookupTableInst], signer);
    await delay(2000);

    const size = 20;
    for (let i = 0; i < accounts.length; i += size) {
      const sub = accounts.slice(i, i + size)
      const extendInstruction = anchor.web3.AddressLookupTableProgram.extendLookupTable({
        payer: signer.publicKey,
        authority: signer.publicKey,
        lookupTable: lookupTableAddress,
        addresses: [
          ...sub,
        ]
      });

      const tx = new Transaction();
      tx.add(extendInstruction)
      console.log(`From ${i} to ${i + size}`)
      await provider.connection.sendTransaction(tx, [signer])
      console.log('Success')
      await delay(2000);
    }
    return lookupTableAddress;
  }

  async function createAndSendV0Tx(
    txInstructions: anchor.web3.TransactionInstruction[],
    payer: Signer,
    addressLookupTable: PublicKey[] | undefined = undefined
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

      const result = []
      for (const address of addressLookupTable) {
        const lookupTableAccount = (
          await provider.connection.getAddressLookupTable(address)
        ).value;
        result.push(lookupTableAccount)
      }

      messageV0 = new anchor.web3.TransactionMessage({
        payerKey: payer.publicKey,
        recentBlockhash: latestBlockhash.blockhash,
        instructions: txInstructions,
      }).compileToV0Message(result);
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

    if (confirmation.value.err) {
      throw new Error(
        `   ❌ - Transaction not confirmed.\nReason: ${confirmation.value.err}`
      );
    }

    console.log("🎉 Transaction Successfully Confirmed!");

  }


  before(async () => {
    await provider.connection.requestAirdrop(users[0].publicKey, 10000000000);
    await provider.connection.requestAirdrop(users[1].publicKey, 10000000000);
    await provider.connection.requestAirdrop(users[2].publicKey, 10000000000);
    const recipients = users.map(e => e.publicKey);
    recipients.push(wallet.publicKey);

    for (const token of portfolio_tokens) {
      if (token.keyPair.secretKey) {
        await createAndMintToken(provider.connection, wallet.payer, token.decimals, mint_amount, [wallet.publicKey], token.keyPair);
        token.key = token.keyPair.publicKey
      }
    }
    await delay(2000);
    console.log('Tokens created')
    for (const token of portfolio_tokens) {
      await createTestPool(
        provider,
        payment_token.key,
        token.key,
        payment_token.decimals,
        token.decimals,
        token.price,
        3
      )
    }

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
      payment_token.key,
      treasury.publicKey
    )).address;
  })

  it("Create portfolio", async () => {
    const portfolio_id = 1;

    const portfolio_collection = getCollectionAddresses(portfolio_id);

    const tx = await program.methods.createPortfolio(
      portfolio_id,
      collection_data.uri,
      portfolio_tokens.map(e => e.key),
      Buffer.from(portfolio_tokens.map(e => e.percent)),
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

    const wrpool = await getPortfolioSwapData(users[0].publicKey, new anchor.BN(0), payment_token.key,
      portfolio_tokens.map(e => { return { key: e.key, percent: e.percent } }),
      portfolio_collection.collection_mint, true);

    const accs = [
      portfolio_collection.collection_mint,
      portfolio_collection.collection_metadata,
      portfolio_collection.collection_master_edition,
      portfolio_collection.collection_onchain_data,
      ...wrpool.accounts
    ]
 
    portfolio_lookup_table = await createTable(accs, wallet.payer)
  });

  it.skip("Fail: buy portfolio with invalid id", async () => {
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
        payment_tokenAccount: userWSOL,
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


    try {
      await createAndSendV0Tx(
        [
          additionalComputeBudgetInstruction,
          instruction
        ],
        users[2],
        [portfolio_lookup_table]
      )
      assert.fail("should fail because collection size is 0");
    } catch (e) {
      const error = e as Error;
      console.log(error.message);
      assert.match(error.message, /0x1773/); // SqrtPriceOutOfBounds
    }
  })

  it.skip("Buy portfolio by SOL", async () => {
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


    await createAndSendV0Tx(
      [
        additionalComputeBudgetInstruction,
        instruction
      ],
      users[0],
      [portfolio_lookup_table]
    )

    for (const ata of wrpool.ata) {
      console.log(await provider.connection.getTokenAccountBalance(ata))
    }

    const d2 = await provider.connection.getAccountInfo(portfolio_collection.collection_metadata);

    // deser.de
    console.log(deser.deserialize(d2.data)[0].collectionDetails)
  })

  it("Buy portfolio by Token", async () => {
    const portfolio_id = 1;
    const nft_id = 1;

    const portfolio_collection = getCollectionAddresses(portfolio_id);
    const deser = getMetadataAccountDataSerializer();
    const d1 = await provider.connection.getAccountInfo(portfolio_collection.collection_metadata);
    console.log(deser.deserialize(d1.data)[0].collectionDetails)
    // const userWSOL = await createWrappedNativeAccount(provider.connection, users[0], users[0].publicKey, 5000000000, undefined, {}, TOKEN_PROGRAM_ID);
    const userAta = getAssociatedTokenAddressSync(
      payment_token.key,
      users[0].publicKey,
      // false,
      // TOKEN_PROGRAM_ID,
      // ASSOCIATED_TOKEN_PROGRAM_ID
    )

    const nft = getNftAddresses(portfolio_collection.collection_mint, nft_id, users[0].publicKey);
    const amount = new anchor.BN(1000000000);
    const t = portfolio_tokens.map(e => { return { key: e.key, percent: e.percent } })
    const wrpool = await getPortfolioSwapData(users[0].publicKey, amount, payment_token.key, t, nft.nft_mint);
    
    const additionalComputeBudgetInstruction =
      ComputeBudgetProgram.setComputeUnitLimit({
        units: 600000,
      });

    // Create ATAs for NFT
    await createAndSendV0Tx(wrpool.instructionsForAta, users[0])
    const extraTable =  await createTable([...wrpool.ata, config_address, treasury_ata_sol] , users[0])
    await delay(2000);
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
        paymentTokenAccount: userAta,
        collection: portfolio_collection.collection_mint,
        collectionMetadata: portfolio_collection.collection_metadata,
        collectionMasterEdition: portfolio_collection.collection_master_edition,
        collectionOnchaindata: portfolio_collection.collection_onchain_data,
        tokenMint: nft.nft_mint,
        nftUserTokenAccount: nft.nft_ata,
        nftRecord: nft.nft_record,
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


    await createAndSendV0Tx(
      [
        additionalComputeBudgetInstruction,
        instruction
      ],
      users[0],
      [portfolio_lookup_table, extraTable]
    )

    for (const ata of wrpool.ata) {
      console.log(await provider.connection.getTokenAccountBalance(ata))
    }

    const d2 = await provider.connection.getAccountInfo(portfolio_collection.collection_metadata);

    // deser.de
    console.log(deser.deserialize(d2.data)[0].collectionDetails)
  })

  it.skip("Transfer NFT", async () => {
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

  it.skip("Burn portfolio", async () => {
    const portfolio_id = 1;
    const nft_id = 1;
    const portfolio_collection = getCollectionAddresses(portfolio_id);
    const nft = getNftAddresses(portfolio_collection.collection_mint, nft_id, users[1].publicKey);
    const deser = getMetadataAccountDataSerializer();
    const atasInstructions = []
    const atas = []

    for (const token of portfolio_tokens) {
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

    // for (const acc of accs) {
    //   console.log(await provider.connection.getAccountInfo(acc))
    // }

    const instruction = await program.methods.burnPortfolio(nft_id).accounts({
      // treasuryAta: treasury_ata_sol,
      // config: config_address,
      payer: users[1].publicKey,
      collection: portfolio_collection.collection_mint,
      collectionMetadata: portfolio_collection.collection_metadata,
      // collectionMasterEdition: portfolio_collection.collection_master_edition,
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
      [portfolio_lookup_table]
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

    console.log(deser.deserialize(d2.data)[0].collectionDetails)

  })

});