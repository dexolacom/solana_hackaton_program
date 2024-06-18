import { Program } from "@coral-xyz/anchor";
import { Biscuit } from "../artifacts";
import { PublicKey, SYSVAR_INSTRUCTIONS_PUBKEY } from "@solana/web3.js";
import { BISCUIT_CONFIG, BISCUIT_VAULT, TOKEN_METADATA_PROGRAM_ID  } from "../constants";
import { getPortfolioCollectionAddresses } from "../collection";
import { getPortfolioAddresses } from "../portfolio";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "../../node_modules/@solana/spl-token";
import BN from "bn.js";

/**
 * @name getBuyPortfolioInstruction
 * @description - This function creates an instruction to buy a portfolio
 * @param program - The program to create the instruction for
 * @param portfolio_id - The id of the portfolio to swap
 * @param collection_id - The id of the collection to swap
 * @param payment_token - The token to use for payment
 * @param user - Target user adress
 * @param uri - Portfolio URI
 * @param amount - Amount to purchase portfolio
 * @notice - Remaining accounts: [portfolioTokenMint, portfolioTokenAccount] * tokens in portfolio
 * @returns - The instruction to buy a portfolio 
 * @dev - user/payment_token account should be existing
**/
export function getBuyPortfolioInstruction(
    program: Program<Biscuit>,
    portfolio_id: number,
    collection_id: number,
    payment_token: PublicKey,
    user: PublicKey,
    uri: string,
    amount: BN,
    treasury: PublicKey,
){
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

    const fundingAccount = getAssociatedTokenAddressSync(
      payment_token,
      user,
      false
    );

    const portfolioPaymentAccount = getAssociatedTokenAddressSync(
      payment_token,
      portfolio.mint,
      true
    );

    const treasury_ata_payment_token = getAssociatedTokenAddressSync(
      payment_token,
      treasury,
      true
    );

    return program.methods.buyPortfolio(
      portfolio_id,
      collection_id,
      uri,
      amount
    )
    .accounts(
      {
        payer: user,
        config: BISCUIT_CONFIG,
        vault:  BISCUIT_VAULT,
        vaultAccount: vaultAccount,
        treasuryAccount: treasury_ata_payment_token,
        collection: portfolio_collection.collection,
        // collectionMetadata: portfolio_collection.metadata,
        // collectionMasterEdition: portfolio_collection.masterEdition,
        collectionOnchaindata: portfolio_collection.collectionOnchaindata,
        mint: portfolio.mint,
        metadata: portfolio.metadata,
        masterEdition: portfolio.masterEdition,
        record: portfolio.record,
        portfolioData: portfolio.portfolioData,
        fundingAccount: fundingAccount,
        paymentToken: payment_token,
        portfolioPaymentAccount: portfolioPaymentAccount,
        mplProgram: TOKEN_METADATA_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        splAtaProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        sysvarInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
      }
    )
    .instruction()
}
