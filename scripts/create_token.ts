

import 'dotenv/config'
import * as anchor from "@coral-xyz/anchor";
import {
    createMint,
    TOKEN_PROGRAM_ID,
} from "../node_modules/@solana/spl-token";
import TOKENS from  "../assets/tokens.json";
import { Keypair } from '@solana/web3.js';
import fs from 'fs/promises';

// const TOKENS = [
//     {
//         symbol: "USDC",
//         decimals: 6,
//         price: 1,
//     }
// ]

const file = 'tokens_prv.json';

async function run() {
    const provider = anchor.AnchorProvider.env();
    const wallet = provider.wallet as anchor.Wallet;

    for (const token of TOKENS) {
        if(token.symbol === "SOL"){
            continue;
        }

        const mint = Keypair.generate();

        await fs.appendFile(file, 
            JSON.stringify({
                symbol: token.symbol,
                mint: mint.publicKey.toString(),
                private: mint.secretKey.toString()
            }) + ",\n"
        );

        console.log(`Token ${token.symbol}. Mint: ${mint.publicKey.toString()}.`)

        await createMint(
            provider.connection,
            wallet.payer,
            wallet.publicKey,
            wallet.publicKey,
            token.decimals,
            mint,
            {
                maxRetries: 5,
                commitment: 'confirmed',
            },
        )

        console.log("Mint created.");
    }
}

run().then(() => console.log('Script successful finished.')).catch(err => console.error(err));