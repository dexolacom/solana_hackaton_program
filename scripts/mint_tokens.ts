

import 'dotenv/config'
import * as anchor from "@coral-xyz/anchor";
import {
    createMint,
    createAccount,
    getAccount,
    getOrCreateAssociatedTokenAccount,
    transfer,
    mintTo,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID, createWrappedNativeAccount, NATIVE_MINT, getAssociatedTokenAddress, createAssociatedTokenAccount,
    createMintToInstruction,
    getAssociatedTokenAddressSync,
    createAssociatedTokenAccountInstruction
} from "../node_modules/@solana/spl-token";
import TOKENS from  "../assets/tokens.json";
import { PublicKey, Transaction } from '@solana/web3.js';

const recepient = new anchor.web3.PublicKey(
    "8QdnKN4JbhpSLdhJVcCswmSy3X1Z3hmyZEG3VvGGNHn7"
);

const tokens_for_mint = [
    'USDC',
    'BTC',
    // 'SOL',
    'ETH',
    'JUP',
    'RNDR',
    'HNT',
    'BONK',
    'PYTH',
    'RAY',
    'JTO',
    'WIF'
]

const amount = 1_000_000_000_000_000_000; // 1 token;

async function run() {
    const provider = anchor.AnchorProvider.env();
    const wallet = provider.wallet as anchor.Wallet;

    // let tx = new Transaction();

    for (const token of tokens_for_mint) {

        const token_data = TOKENS.find(t => t.symbol === token);
        const token_key = new PublicKey(token_data.key);
        if(!token_data){
            throw new Error(`Token ${token} not found in tokens.json`);
        }
        const user1ATA = await getOrCreateAssociatedTokenAccount(
            provider.connection,
            wallet.payer,
            token_key,
            recepient
        );

        console.log(`User ${recepient.toString()} ATA:  ${user1ATA.address};`);

        const mint = await mintTo(
            provider.connection,
            wallet.payer,
            token_key,
            user1ATA.address,
            wallet.payer,
            amount,
            [],
            {},
            TOKEN_PROGRAM_ID
        );

        console.log("Token mint: " + mint.toString());
    }
}

run().then(() => console.log('Script successful finished.')).catch(err => console.error(err));