
import 'dotenv/config'
import * as anchor from "@coral-xyz/anchor";
import { getAssociatedTokenAddressSync, getOrCreateAssociatedTokenAccount, NATIVE_MINT } from '@solana/spl-token';
import { Biscuit } from "../target/types/biscuit";

import { Program } from "@coral-xyz/anchor";
import { PublicKey, Transaction } from '@solana/web3.js';
import TOKENS from "../assets/tokens.json";

async function run() {
    const provider = anchor.AnchorProvider.env();
    const wallet = provider.wallet as anchor.Wallet;
    const program = anchor.workspace.Biscuit as Program<Biscuit>;

    const config_address = anchor.web3.PublicKey.findProgramAddressSync(
        [
            Buffer.from("config"),
        ],
        program.programId
    )[0];

    const vault_address = anchor.web3.PublicKey.findProgramAddressSync(
        [
            Buffer.from("vault"),
        ],
        program.programId
    )[0];

    const instruction = await program.methods.initialize(
        new anchor.BN(99999999),
        wallet.publicKey
    ).accounts({
        config: config_address,
        vault: vault_address,
        payer: wallet.publicKey
    }).signers([wallet.payer]).instruction();

    const tx = new Transaction();
    tx.add(instruction);

    const res = await provider.sendAndConfirm(tx, [wallet.payer]);
    console.log(res);
}

run()