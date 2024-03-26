import * as anchor from "@coral-xyz/anchor";
import { Program, BorshAccountsCoder } from "@coral-xyz/anchor";
import { Biscuit } from "../target/types/biscuit";
import metadata_idl from "../idl/token_metadata.json";
// import { Metaplex } from "@metaplex-foundation/js";
import {
  createMint,
  createAccount,
  getAccount,
  getOrCreateAssociatedTokenAccount,
  transfer,
  mintTo,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID, createWrappedNativeAccount, NATIVE_MINT, getAssociatedTokenAddress, createAssociatedTokenAccount
} from "@solana/spl-token";
import { BN } from "bn.js";
import { ComputeBudgetInstruction, ComputeBudgetProgram, PublicKey, Signer, Transaction, } from "@solana/web3.js";
// import { Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  MPL_TOKEN_METADATA_PROGRAM_ID,
  findMetadataPda,
  Metadata,
  deserializeMasterEdition,
  deserializeMetadata,
  
} from "@metaplex-foundation/mpl-token-metadata";

describe("biscuit", () => {

  const collection_data = {
    title: "Portfolio#1",
    symbol: "PRT1",
    uri: "https://raw.githubusercontent.com/Coding-and-Crypto/Solana-NFT-Marketplace/master/assets/example.json"
  }

  const portfolioMintKeypair: anchor.web3.Keypair = anchor.web3.Keypair.generate();

  const portfolioTokens = [
    {
      keyPair: anchor.web3.Keypair.generate(),
      percent: 300
    },
    {
      keyPair: anchor.web3.Keypair.generate(),
      percent: 700
    },
  ]

  const paymentToken = {
    keyPair: anchor.web3.Keypair.generate(),
  }

  const users = new Array(3).fill(0).map(() => anchor.web3.Keypair.generate());

  const provider = anchor.AnchorProvider.env()
  const wallet = provider.wallet as anchor.Wallet;
  // anchor.setProvider(provider);

  const program = anchor.workspace.Biscuit as Program<Biscuit>;
  // console.log(anchor.workspace)
  const TOKEN_METADATA_PROGRAM_ID = new anchor.web3.PublicKey(
    "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
  );

  let metaplex_program;
  // const metaplex = new anchor.Program(metadata_idl,  TOKEN_METADATA_PROGRAM_ID, provider);

  async function getCollectionAddresses() {
    const associatedTokenAccount = (await anchor.web3.PublicKey.findProgramAddress(
      [
        Buffer.from("collection")
      ],
      program.programId
    ))[0]

    const metadataAccountAddress = (await anchor.web3.PublicKey.findProgramAddress(
      [
        Buffer.from("metadata"),
        TOKEN_METADATA_PROGRAM_ID.toBuffer(),
        associatedTokenAccount.toBuffer(),
      ],
      TOKEN_METADATA_PROGRAM_ID
    ))[0]

    const masterEditionAccountAddress = (await anchor.web3.PublicKey.findProgramAddress(
      [
        Buffer.from("metadata"),
        TOKEN_METADATA_PROGRAM_ID.toBuffer(),
        associatedTokenAccount.toBuffer(),
        Buffer.from("edition")
      ],
      TOKEN_METADATA_PROGRAM_ID
    ))[0]

    const onchainDataAddress = (await anchor.web3.PublicKey.findProgramAddress(
      [
        Buffer.from("onchain-data"),
        metadataAccountAddress.toBuffer(),
      ],
      program.programId
    ))[0]

    return {
      tokenAccount: associatedTokenAccount,
      metadataAccountAddress,
      masterEditionAccountAddress,
      onchainDataAddress
    }
  }

  async function getNftAddresses(collection: PublicKey, id: number) {
    // console.log("BUF1: " +  new anchor.BN(id).toBuffer())
    const associatedTokenAccount = (await anchor.web3.PublicKey.findProgramAddress(
      [
        Buffer.from("token"),
        collection.toBuffer(),
        Buffer.from([id])
      ],
      program.programId
    ))[0]

    const metadataAccountAddress = (await anchor.web3.PublicKey.findProgramAddress(
      [
        Buffer.from("metadata"),
        TOKEN_METADATA_PROGRAM_ID.toBuffer(),
        associatedTokenAccount.toBuffer(),
      ],
      TOKEN_METADATA_PROGRAM_ID
    ))[0]

    const masterEditionAccountAddress = (await anchor.web3.PublicKey.findProgramAddress(
      [
        Buffer.from("metadata"),
        TOKEN_METADATA_PROGRAM_ID.toBuffer(),
        associatedTokenAccount.toBuffer(),
        Buffer.from("edition")
      ],
      TOKEN_METADATA_PROGRAM_ID
    ))[0]

    const onchainDataAddress = (await anchor.web3.PublicKey.findProgramAddress(
      [
        Buffer.from("onchain-data"),
        metadataAccountAddress.toBuffer(),
      ],
      program.programId
    ))[0]

    const nftATA = await getAssociatedTokenAddress(
      associatedTokenAccount,
      users[0].publicKey
    )

    const nftRecord = (await anchor.web3.PublicKey.findProgramAddress(
      [
        Buffer.from("metadata"),
        TOKEN_METADATA_PROGRAM_ID.toBuffer(),
        associatedTokenAccount.toBuffer(),
        Buffer.from("token_record"),
        nftATA.toBuffer()
      ],
      TOKEN_METADATA_PROGRAM_ID
    ))[0]

    return {
      tokenAccount: associatedTokenAccount,
      metadataAccountAddress,
      masterEditionAccountAddress,
      onchainDataAddress,
      nftATA,
      nftRecord
    }
  }

  let portfolio_collection;

  before(async () => {
    await provider.connection.requestAirdrop(portfolioMintKeypair.publicKey, 1000000000);
    await provider.connection.requestAirdrop(users[0].publicKey, 10000000000);

    await createMint(provider.connection, wallet.payer, wallet.publicKey, wallet.publicKey, 9, paymentToken.keyPair, {}, TOKEN_PROGRAM_ID)
    //Create tokens 

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
    portfolio_collection = await getCollectionAddresses();

    // metaplex_program = new anchor.Program(metadata_idl as anchor.Idl, TOKEN_METADATA_PROGRAM_ID, provider)
    // const candyMachineV2Program = new anchor.web3.PublicKey('cndy3Z4yapfJBmL3ShUp5exZKqR3z33thTzeNMm2gRZ');
    // const idl = await anchor.Program.fetchIdl(TOKEN_METADATA_PROGRAM_ID, provider);
    // console.log(idl)
  })

  it("Create portfolio", async () => {

    // const portfolio_collection = await getNftAddresses()
    // const tokenAddress = await anchor.utils.token.associatedAddress({
    //   mint: mintKeypair.publicKey,
    //   owner: wallet.publicKey
    // });
    // console.log(`New token: ${mintKeypair.publicKey}`);

    const tx = await program.methods.createPortfolio(
      collection_data.title,
      collection_data.symbol,
      collection_data.uri,
      portfolioTokens.map(e => e.keyPair.publicKey),
      Buffer.from(portfolioTokens.map(e => e.percent)))
      .accounts({
        authority: portfolioMintKeypair.publicKey,
        mplProgram: TOKEN_METADATA_PROGRAM_ID,
        portfolioMetadata: portfolio_collection.onchainDataAddress,
        collectionMint: portfolio_collection.tokenAccount,
        metadataAccount: portfolio_collection.metadataAccountAddress,
        masterEditionAccount: portfolio_collection.masterEditionAccountAddress,
        sysvarInstructions: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
      }).signers([portfolioMintKeypair]).rpc().catch(e => console.error(e));

    // console.log(program.account)
    const potrfolio = await program.account.portfolioCollectionData.fetch(portfolio_collection.onchainDataAddress);
    // console.log(potrfolio)
  });


  it("Buy portfolio by Token", async () => {

    const user1ATA = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      wallet.payer,
      paymentToken.keyPair.publicKey,
      users[0].publicKey
    );
    const userTokenAccount = await provider.connection.getTokenAccountBalance(user1ATA.address);
    console.log(userTokenAccount)
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
    }).signers([users[0]]).preInstructions([additionalComputeBudgetInstruction])
    .rpc().catch(e => console.error(e));


    const accounts = await provider.connection.getTokenAccountsByOwner(users[0].publicKey, {
      programId: TOKEN_PROGRAM_ID
    });

    console.log(accounts)

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

  it.skip("Buy portfolio by SOL", async () => {
    console.log(await provider.connection.getBalance(users[0].publicKey));
    // console.log(await provider.connection.getBalance(program.programId));
    // console.log(await p)
    const user1WSOL = await createWrappedNativeAccount(provider.connection, users[0], users[0].publicKey, 5000000000, undefined, {}, TOKEN_PROGRAM_ID);
    console.log(await provider.connection.getBalance(users[0].publicKey));
    const userTokenAccount = await provider.connection.getTokenAccountBalance(user1WSOL);
    console.log(userTokenAccount)
    const programATA = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      wallet.payer,
      NATIVE_MINT,
      program.programId
    );
    const programTokenAccount = await provider.connection.getTokenAccountBalance(programATA.address);
    console.log(programTokenAccount)


    const nft_id = 2;
    const nft = await getNftAddresses(portfolio_collection.tokenAccount, nft_id);

    const tx = await program.methods.buyPortfolio(
      nft_id,
      collection_data.uri,
      new anchor.BN(1000000000)
    )
      .accounts({
        payer: users[0].publicKey,
        portfolioData: nft.onchainDataAddress,
        tokenMint: nft.tokenAccount,
        metadataAccount: nft.metadataAccountAddress,
        masterEditionAccount: nft.masterEditionAccountAddress,
        collectionMetadata: portfolio_collection.onchainDataAddress,
        collection: portfolio_collection.tokenAccount,
        paymentToken: NATIVE_MINT,
        mplProgram: TOKEN_METADATA_PROGRAM_ID,
        sysvarInstructions: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        userTokenAccount: user1WSOL,
        programTokenAccount: programATA.address,
        splAtaProgram: ASSOCIATED_TOKEN_PROGRAM_ID
      }).signers([users[0]]).rpc().catch(e => console.error(e));

    console.log(await provider.connection.getBalance(users[0].publicKey));
    const userTokenAccount2 = await provider.connection.getTokenAccountBalance(user1WSOL);
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