import { Program } from "@coral-xyz/anchor";
import { Biscuit } from "../artifacts";
import { PublicKey, SYSVAR_INSTRUCTIONS_PUBKEY,  AccountMeta } from "@solana/web3.js";
import { BISCUIT_CONFIG, BISCUIT_VAULT, TOKEN_METADATA_PROGRAM_ID, BurnModel  } from "../constants";
import { getPortfolioCollectionAddresses } from "../collection";
import { getPortfolioAddresses } from "../portfolio";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "../../node_modules/@solana/spl-token";

/**
 * @name getWithdrawPortfolioInstruction
 * @description - This function creates an instruction to withdraw a portfolio
 * @param program - The program to create the instruction for
 * @param portfolio_id - The id of the portfolio to withdraw
 * @param collection_id - The id of the collection to withdraw
 * @param payment_token - The token to use for payment
 * @param user - Target user adress
 * @param collection_tokens - Collection tokens
 * @param model - Burn model
**/
export function getWithdrawPortfolioInstruction(
    program: Program<Biscuit>,
    portfolio_id: number,
    collection_id: number,
    payment_token: PublicKey,
    user: PublicKey,
    collection_tokens: PublicKey[],
    model: BurnModel,
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
      true
    );

    const remainingAccounts:  AccountMeta[] = [];
    // const burnModel = BurnModel[model];

    if(model === BurnModel.Raw){
      for (const token of collection_tokens) {
        const nft_ata = getAssociatedTokenAddressSync(token, portfolio.mint, true);
        remainingAccounts.push({pubkey: nft_ata, isSigner: false, isWritable: true});
        const ata = getAssociatedTokenAddressSync(token, user, false);
        remainingAccounts.push({pubkey: ata, isSigner: false, isWritable: true});
        const treasury_ata = getAssociatedTokenAddressSync(token, treasury, true);
        remainingAccounts.push({pubkey: treasury_ata, isSigner: false, isWritable: true});
      }
    }

    if(model === BurnModel.Swap){
      const nft_ata = getAssociatedTokenAddressSync(payment_token, portfolio.mint, true);
      remainingAccounts.push({pubkey: nft_ata, isSigner: false, isWritable: true});
      const ata = getAssociatedTokenAddressSync(payment_token, user, false);
      remainingAccounts.push({pubkey: ata, isSigner: false, isWritable: true});
      const treasury_ata = getAssociatedTokenAddressSync(payment_token, treasury, true);
      remainingAccounts.push({pubkey: treasury_ata, isSigner: false, isWritable: true});
    }
    
    return program.methods.withdrawPortfolio(
      portfolio_id,
      collection_id,
    )
    .accounts(
      {
        payer: user,
        config: BISCUIT_CONFIG,
        vault:  BISCUIT_VAULT,
        vaultAccount: vaultAccount,
        collection: portfolio_collection.collection,
        collectionMetadata: portfolio_collection.metadata,
        collectionOnchaindata: portfolio_collection.collectionOnchaindata,
        mint: portfolio.mint,
        metadata: portfolio.metadata,
        masterEdition: portfolio.masterEdition,
        record: portfolio.record,
        portfolioData: portfolio.portfolioData,
        mplProgram: TOKEN_METADATA_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        splAtaProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        sysvarInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
      }
    )
    .remainingAccounts(remainingAccounts)
    .instruction()
}
