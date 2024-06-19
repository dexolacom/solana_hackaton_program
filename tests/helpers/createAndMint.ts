import * as anchor from "@coral-xyz/anchor";
import { createMint, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction, TOKEN_PROGRAM_ID, mintTo, createMintToInstruction } from "@solana/spl-token";
import { Keypair, PublicKey, Signer, Transaction } from "@solana/web3.js";

export async function createAndMintToken(connection: anchor.web3.Connection, wallet: Signer,  decimals: number, amount: number | bigint, recipients: anchor.web3.PublicKey[], mint?: Keypair) {

    const token_mint = mint? mint : anchor.web3.Keypair.generate();

    await createMint(connection, wallet, wallet.publicKey, wallet.publicKey, decimals, token_mint, {}, TOKEN_PROGRAM_ID)
    const tokenSupply = await connection.getTokenSupply(token_mint.publicKey);

    console.log('Create token mint. Mint: ' + token_mint.publicKey.toBase58());
    await mintTokens(connection, wallet, token_mint.publicKey, amount, recipients);
    return token_mint;
}


export async function mintTokens(connection: anchor.web3.Connection, wallet: Signer, mint: PublicKey, amount: number | bigint, recipients: PublicKey[]) {

    const createAtaTx = new Transaction()
    const mintToTx = new Transaction();
    for (const rec of recipients) {
        const recATA = getAssociatedTokenAddressSync(
            mint,
            rec
        );

        createAtaTx.add(
            createAssociatedTokenAccountInstruction(
                wallet.publicKey,
                recATA,
                rec,
                mint,
                TOKEN_PROGRAM_ID,
                ASSOCIATED_TOKEN_PROGRAM_ID
            ))


        mintToTx.add(
            createMintToInstruction(
                mint, recATA, wallet.publicKey, amount, [], 
            )
        )
    }



    await connection.sendTransaction(createAtaTx, [wallet]);
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log('Create atas');
    await connection.sendTransaction(mintToTx, [wallet]).catch(err=>{console.error(err.logs); throw new Error(err)} )
    console.log('Mint tokens');
}
