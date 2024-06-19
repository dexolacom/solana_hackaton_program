import { Program } from "@coral-xyz/anchor";
import { Biscuit } from "../artifacts";
import { PublicKey, SYSVAR_INSTRUCTIONS_PUBKEY } from "@solana/web3.js";
import { BISCUIT_VAULT,  BurnMap,  BurnModel } from "../constants";
import { getPortfolioCollectionAddresses } from "../collection";
import { getPortfolioAddresses } from "../portfolio";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "../../node_modules/@solana/spl-token";

/**
    * Burn a portfolio
    * @name burnPortfolioInstruction
    * @param {Program<Biscuit>} program - Anchor program
    * @param {number} portfolio_id - Portfolio id
    * @param {number} collection_id - Collection id
    * @param {PublicKey} payment_token - Payment token
    * @param {PublicKey} user - User's public key
    * @param {BurnModel} model - Burn model
**/
export function getBurnPortfolioInstruction(
    program: Program<Biscuit>,
    portfolio_id: number,
    collection_id: number,
    payment_token: PublicKey,
    user: PublicKey,
    model: BurnModel
) {
    const portfolio_collection = getPortfolioCollectionAddresses(collection_id);
    const portfolio = getPortfolioAddresses(
        portfolio_collection.collection,
        portfolio_id,
        user
    );

    const vaultAccount = getAssociatedTokenAddressSync(
        portfolio.mint,
        BISCUIT_VAULT,
        true,
    );
    const burnModel = BurnMap[model];

    return program.methods.burnPortfolio(
        portfolio_id,
        collection_id,
        burnModel
    ).accounts(
        {
            payer: user,
            vault: BISCUIT_VAULT,
            vaultAccount: vaultAccount,
            collection: portfolio_collection.collection,
            collectionOnchaindata: portfolio_collection.collectionOnchaindata,
            mint: portfolio.mint,
            portfolioData: portfolio.portfolioData,
            userPotrfolioAccount: portfolio.userPortfolioAta,
            paymentToken: payment_token,
            tokenProgram: TOKEN_PROGRAM_ID,
            sysvarInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
        }
    )
    .instruction()
}
