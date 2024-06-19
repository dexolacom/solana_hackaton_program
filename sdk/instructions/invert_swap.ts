import { Program } from "@coral-xyz/anchor";
import { Biscuit } from "../artifacts";
import { PublicKey, AccountMeta, SYSVAR_INSTRUCTIONS_PUBKEY } from "@solana/web3.js";
import { ORCA_WHIRLPOOL_PROGRAM_ID } from "../constants";
import { getPortfolioCollectionAddresses } from "../collection";
import { getPortfolioAddresses } from "../portfolio";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "../../node_modules/@solana/spl-token";
import BN from "bn.js";

/**
 * @name getInvertSwapPortfolioInstruction
 * @description - This function creates an instruction to swap a portfolio
 * @param program - The program to create the instruction for
 * @param swap_data - The swap data from getSwapPortfolioData
 * @param portfolio_id - The id of the portfolio to swap
 * @param collection_id - The id of the collection to swap
 * @param payment_token - The token to use for payment
 * @param user - Target user adress
**/ 
export async function getInvertSwapPortfolioInstruction(
    program: Program<Biscuit>,
    swap_data:  {
      accounts: AccountMeta[],
      args: {
        other_amount_threshold: BN[],
        sqrt_price_limit: BN[],
        amount_specified_is_input: boolean[],
        a_to_b: boolean[],
      },
    },
    swap_count_per_transaction: number,
    portfolio_id: number,
    collection_id: number,
    payment_token: PublicKey,
    user: PublicKey,
){
    const portfolio_collection = getPortfolioCollectionAddresses(collection_id);
    const portfolio = getPortfolioAddresses(
      portfolio_collection.collection,
      portfolio_id,
      user
    );

    const portfolioPaymentAccount = getAssociatedTokenAddressSync(
      payment_token,
      portfolio.mint,
      true
    );

    const instructions = [];
    const swap_length = swap_data.accounts.length / 8;
    for (let i = 0; i < swap_length; i+=swap_count_per_transaction) {
      const end = swap_length > i + swap_count_per_transaction ? i + swap_count_per_transaction : swap_length;

      const inst = await program.methods.invertSwapPortfolio(
        portfolio_id,
        collection_id,
        swap_data.args.other_amount_threshold.slice(i, end),
        swap_data.args.sqrt_price_limit.slice(i, end),
        swap_data.args.amount_specified_is_input.slice(i, end),
        swap_data.args.a_to_b.slice(i, end)
      )
      .accounts(
        {
          payer: user,
          collection: portfolio_collection.collection,
          collectionOnchaindata: portfolio_collection.collectionOnchaindata,
          mint: portfolio.mint,
          portfolioData: portfolio.portfolioData,
          portfolioPaymentAccount: portfolioPaymentAccount, 
          paymentToken: payment_token,
          tokenProgram: TOKEN_PROGRAM_ID,
          splAtaProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          sysvarInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
          whirlpoolProgram: ORCA_WHIRLPOOL_PROGRAM_ID,
        }
      )
      .remainingAccounts(swap_data.accounts.slice(i * 8, end * 8))
      .instruction()
    
      instructions.push(inst);
    }

    return instructions;
}
