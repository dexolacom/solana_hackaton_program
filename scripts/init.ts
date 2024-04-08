
import 'dotenv/config'
import * as anchor from "@coral-xyz/anchor";
import { getOrCreateAssociatedTokenAccount, NATIVE_MINT } from '@solana/spl-token';
import { Biscuit } from "../target/types/biscuit";

import { Program } from "@coral-xyz/anchor";
import { PublicKey, Transaction } from '@solana/web3.js';
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

    const instruction = await program.methods.initialize(
        new anchor.BN(99999999),
        wallet.publicKey
      ).accounts({
        config: config_address,
        payer: wallet.publicKey
      }).signers([wallet.payer]).instruction();

      const tx = new Transaction();
      tx.add(instruction);
          
    const res = await provider.connection.sendTransaction(tx, [wallet.payer])

    console.log(config_address)
  
     await getOrCreateAssociatedTokenAccount(
        provider.connection,
        wallet.payer,
        NATIVE_MINT,
        wallet.publicKey
    )

    await getOrCreateAssociatedTokenAccount(
        provider.connection,
        wallet.payer,
        new anchor.web3.PublicKey("BhKhpfHuHvcLtteqDidKrzAtCbjDMSu6P2PDF7vFCsSe"),
        wallet.publicKey
    )
}

run()