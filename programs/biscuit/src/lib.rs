use anchor_lang::prelude::*;
declare_id!("7Zrb5JhpFNgP3UYuvoXCV4JbevnwvQYsxDCmrZb7jDed");

pub mod err;
pub mod instructions;
pub mod state;
use instructions::*;
use crate::state::*;
// use state::*;

#[program]
pub mod biscuit {
    use super::*;

    pub fn initialize(_ctx: Context<Initialize>) -> Result<()> {
        Ok(())
    }

    pub fn create_portfolio(
        ctx: Context<CreatePortfolio>,
        name: String,
        symbol: String,
        uri: String,
        tokens: Vec<Pubkey>,
        percentages: Vec<u8>,
    ) -> Result<()> {
        return instructions::portfolio::create_portfolio(
            ctx,
            name,
            symbol,
            uri,
            tokens,
            percentages,
        );
    }

    pub fn buy_portfolio(
        ctx: Context<BuyPortfolio>,
        _id: u8,
        uri: String,
        amount: u64,
    ) -> Result<()> {
        return instructions::buy::buy_portfolio(ctx, _id, uri, amount);
    }

}

#[derive(Accounts)]
pub struct Initialize {}
