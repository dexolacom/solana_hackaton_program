use anchor_lang::prelude::*;
declare_id!("5R81ubNGkaFJbCjBWpjsySV55FVRdqZPioDiaEMEUkPe");

pub mod err;
pub mod instructions;
pub mod state;
use state::portfolio::BurnModel;
use instructions::*;

#[program]
pub mod biscuit {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, amount: u64, treasury: Pubkey) -> Result<()> {
        return instructions::initialize::handle(ctx, amount, treasury);
    }

    pub fn create_portfolio(
        ctx: Context<CreatePortfolio>,
        _portfolio_id: u8,
        uri: String,
        tokens: Vec<Pubkey>,
        percentages: Vec<u16>,
        fee_in: u32,
        fee_out: u32
    ) -> Result<()> {
        return instructions::create_collection::create_portfolio_collection(
            ctx,
            _portfolio_id,
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
        _portfolio_id: u8,
        uri: String,
        amount: u64,
    ) -> Result<()> {
        return instructions::buy_portfolio::buy_portfolio(
            ctx,
            _id,
            _portfolio_id,
            uri,
            amount,
        );
    }

    pub fn swap_portfolio<'c: 'info, 'info>(
        ctx: Context<'_, '_, 'c, 'info, SwapPortfolio<'info>>,
        _id: u8,
        _portfolio_id: u8,
        other_amount_threshold: Vec<u64>,
        sqrt_price_limit: Vec<u128>,
        amount_specified_is_input: Vec<bool>,
        a_to_b: Vec<bool>,
    ) -> Result<()> {
        return instructions::swap_portfolio::swap_portfolio(
            ctx,
            _id,
            _portfolio_id,
            other_amount_threshold,
            sqrt_price_limit,
            amount_specified_is_input,
            a_to_b,
        );
    }

    pub fn invert_swap_portfolio<'c: 'info, 'info>(
        ctx: Context<'_, '_, 'c, 'info, SwapPortfolio<'info>>,
        _id: u8,
        _portfolio_id: u8,
        other_amount_threshold: Vec<u64>,
        sqrt_price_limit: Vec<u128>,
        amount_specified_is_input: Vec<bool>,
        a_to_b: Vec<bool>,
    ) -> Result<()> {
        return instructions::swap_portfolio::invert_swap_portfolio(
            ctx,
            _id,
            _portfolio_id,
            other_amount_threshold,
            sqrt_price_limit,
            amount_specified_is_input,
            a_to_b,
        );
    }

    pub fn receive_portfolio<'c: 'info, 'info>(
        ctx: Context<'_, '_, 'c, 'info, ReceivePortfolio<'info>>,
        _id: u8,
        _portfolio_id: u8
    ) -> Result<()> {
        return instructions::receive_portfolio::receive_portfolio(
            ctx,
            _id,
            _portfolio_id
        );
    }

    pub fn burn_portfolio<'c: 'info, 'info>(
        ctx: Context<'_, '_, 'c, 'info, BurnPortfolio<'info>>,
        _id: u8,
        _portfolio_id: u8,
        model: BurnModel,
    ) -> Result<()> {
        return instructions::burn_portfolio::burn_portfolio(
            ctx,
            _id,
            _portfolio_id,
            model
        );
    }

    pub fn withdraw_portfolio<'c: 'info, 'info>(
        ctx: Context<'_, '_, 'c, 'info, WithdrawPortfolio<'info>>,
        _id: u8,
        _portfolio_id: u8,
    ) -> Result<()> {
        return instructions::withdraw_portfolio::withdraw_portfolio(
            ctx,
            _id,
            _portfolio_id,
        );
    }
}
