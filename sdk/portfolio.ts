import { Connection, PublicKey } from "@solana/web3.js";
import { Program } from "@project-serum/anchor";
import {
    createAssociatedTokenAccountInstruction,
    getAssociatedTokenAddressSync
} from "../node_modules/@solana/spl-token";
import { BISCUIT_PROGRAM_ID, TOKEN_METADATA_PROGRAM_ID } from "./constants";
import { Biscuit } from "./artifacts";

export function getPortfolioAddresses(
    collection_mint: PublicKey,
    portfolio_id: number,
    user_pubkey: PublicKey,
    BISCUIT_PROGRAM = BISCUIT_PROGRAM_ID,
    TOKEN_METADATA_PROGRAM = TOKEN_METADATA_PROGRAM_ID
) {
    const mint = PublicKey.findProgramAddressSync(
        [
            Buffer.from("token"),
            collection_mint.toBuffer(),
            Buffer.from([portfolio_id])
        ],
        BISCUIT_PROGRAM
    )[0]

    const metadata = PublicKey.findProgramAddressSync(
        [
            Buffer.from("metadata"),
            TOKEN_METADATA_PROGRAM.toBuffer(),
            mint.toBuffer(),
        ],
        TOKEN_METADATA_PROGRAM
    )[0]

    const masterEdition = PublicKey.findProgramAddressSync(
        [
            Buffer.from("metadata"),
            TOKEN_METADATA_PROGRAM.toBuffer(),
            mint.toBuffer(),
            Buffer.from("edition")
        ],
        TOKEN_METADATA_PROGRAM
    )[0]

    const portfolioData = PublicKey.findProgramAddressSync(
        [
            Buffer.from("onchain-data"),
            mint.toBuffer()
        ],
        BISCUIT_PROGRAM
    )[0]

    const userPortfolioAta = getAssociatedTokenAddressSync(
        mint,
        user_pubkey,
        false
    );

    const record = PublicKey.findProgramAddressSync(
        [
            Buffer.from("metadata"),
            TOKEN_METADATA_PROGRAM.toBuffer(),
            mint.toBuffer(),
            Buffer.from("token_record"),
            userPortfolioAta.toBuffer()
        ],
        TOKEN_METADATA_PROGRAM
    )[0];

    return {
        mint,
        metadata,
        masterEdition,
        portfolioData,
        userPortfolioAta,
        record
    }
}

export async function getPortfolioData(program: Program<Biscuit>, portfolioDataAddress: PublicKey) {
    return program.account.portfolio.fetch(portfolioDataAddress);
}

export function getPortfolioTokenAccounts(portfolio: PublicKey, collection_tokens: PublicKey[]) {
    const result = [];
    for (const token of collection_tokens) {
        result.push(
            getAssociatedTokenAddressSync(
                token,
                portfolio,
                true
            )
        )
    }
    return result;
}

export function getCreatePortfolioTokenAccountsInstructions(portfolio: PublicKey, collection_tokens: PublicKey[], user: PublicKey) {
    const result = [];
    for (const token of collection_tokens) {
        const ata = getAssociatedTokenAddressSync(
            token,
            portfolio,
            true
        );

        result.push(
            createAssociatedTokenAccountInstruction(
                user,
                ata, 
                portfolio,
                token
            )
        )
    }
    return result;
}