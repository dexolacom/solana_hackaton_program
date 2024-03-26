

import * as anchor from "@coral-xyz/anchor";
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
import fs from "fs";

const tokenMint = new anchor.web3.PublicKey(
    ""
);
const recepient =  new anchor.web3.PublicKey(
    ""
);

const amounts = 1_000_000_000; // 1 token;


async function run() {
    const provider = anchor.AnchorProvider.env();
    const wallet = provider.wallet as anchor.Wallet;

    const user1ATA = await getOrCreateAssociatedTokenAccount(
        provider.connection,
        wallet.payer,
        tokenMint,
        recepient
    );

    console.log(`User ${recepient.toString()} ATA:  ${user1ATA.address};`);
  
    const mint = await mintTo(
        provider.connection,
        wallet.payer,
        tokenMint,
        user1ATA.address,
        wallet.payer,
        amounts,
        [],
        {},
        TOKEN_PROGRAM_ID
      );

    console.log("Token mint: " + mint.toString());
}

run().then(() => console.log('Script successful finished.')).catch(err => console.error(err));