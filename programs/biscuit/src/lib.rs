use anchor_lang::prelude::*;
declare_id!("7Zrb5JhpFNgP3UYuvoXCV4JbevnwvQYsxDCmrZb7jDed");

pub mod err;
pub mod instructions;
pub mod state;
use instructions::*;

#[program]
pub mod biscuit {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, amount: u64, treasury: Pubkey) -> Result<()> {
        return instructions::config::handle(ctx, amount, treasury);
    }

    pub fn create_portfolio(
        ctx: Context<CreatePortfolio>,
        portfolio_id: u8,
        uri: String,
        tokens: Vec<Pubkey>,
        percentages: Vec<u8>,
        fee_in: u8,
        fee_out: u8
    ) -> Result<()> {
        return instructions::portfolio::create_portfolio(
            ctx,
            portfolio_id,
            uri,
            tokens,
            percentages,
            fee_in,
            fee_out
        );
    }

    pub fn buy_portfolio<'c: 'info, 'info>(
        ctx: Context<'_, '_, 'c, 'info, BuyPortfolio<'info>>,
        _id: u8,
        portfolio_id: u8,
        uri: String,
        amount: u64,
        other_amount_threshold: Vec<u64>,
        sqrt_price_limit: Vec<u128>,
        amount_specified_is_input: Vec<bool>,
        a_to_b: Vec<bool>,
    ) -> Result<()> {
        return instructions::buy::buy_portfolio(
            ctx,
            _id,
            portfolio_id,
            uri,
            amount,
            other_amount_threshold,
            sqrt_price_limit,
            amount_specified_is_input,
            a_to_b,
        );
    }

    pub fn burn_portfolio<'c: 'info, 'info>(
        ctx: Context<'_, '_, 'c, 'info, BurnPortfolio<'info>>,
        _id: u8,
    ) -> Result<()> {
        return instructions::burn::burn_portfolio(
            ctx,
            _id,
        );
    }
}
