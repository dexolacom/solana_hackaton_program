

import 'dotenv/config'
import * as anchor from "@coral-xyz/anchor";
import {
  createMint,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Program } from "@coral-xyz/anchor";
import { Biscuit } from "../target/types/biscuit";
import { Transaction } from '@solana/web3.js';

const collection_data = {
  title: "Classic#1",
  symbol: "BPC",
  uri: "https://www.library.yorku.ca/ds/wp-content/uploads/2021/07/digitalportfolio.png"
}

const portfolioTokens = [
  {
    publicKey: "7e9rSMdq7YRzvc8JCcaSbsRtjEwnPNuYRM8LGagdJLpe",
    percent: 700
  },
  {
    publicKey: "2xP4dsEDBgfvpkf1vTGfs8imk3jhqiX8akmqn2E9Dt7V",
    percent: 300
  }
]
async function run() {

  const provider = anchor.AnchorProvider.env();
  const wallet = provider.wallet as anchor.Wallet;
  const TOKEN_METADATA_PROGRAM_ID = new anchor.web3.PublicKey(
    "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
  );
  const program = anchor.workspace.Biscuit as Program<Biscuit>;

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

  const instruction = await program.methods.createPortfolio(
    collection_data.title,
    collection_data.symbol,
    collection_data.uri,
    portfolioTokens.map(e => new anchor.web3.PublicKey(e.publicKey)),
    Buffer.from(portfolioTokens.map(e => e.percent)))
    .accounts({
      authority: wallet.publicKey,
      mplProgram: TOKEN_METADATA_PROGRAM_ID,
      portfolioMetadata: onchainDataAddress,
      collectionMint: associatedTokenAccount,
      metadataAccount: metadataAccountAddress,
      masterEditionAccount: masterEditionAccountAddress,
      sysvarInstructions: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
    })
    .signers([wallet.payer]).instruction();

    const tx = new Transaction();
    tx.add(instruction);
    
    const res = await provider.connection.sendTransaction(tx, [wallet.payer])
    console.log(res)
  // console.log(program.account)
  // const potrfolio = await program.account.portfolioCollectionData.fetch(portfolio_collection.onchainDataAddress);
}

run().then(() => console.log('Script successful finished.')).catch(err => console.error(err));