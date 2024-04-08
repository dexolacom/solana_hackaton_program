

import 'dotenv/config'
import * as anchor from "@coral-xyz/anchor";
import {
    createMint,
    TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

async function run() {
    const provider = anchor.AnchorProvider.env();
    const wallet = provider.wallet as anchor.Wallet;

    const paymentToken = anchor.web3.Keypair.generate();

    const mint = await createMint(
        provider.connection,
        wallet.payer,
        wallet.publicKey,
        wallet.publicKey,
        5,
        paymentToken,
        {},
        TOKEN_PROGRAM_ID
    );

    console.log("Token mint: " + mint.toString());
}

run().then(() => console.log('Script successful finished.')).catch(err => console.error(err));