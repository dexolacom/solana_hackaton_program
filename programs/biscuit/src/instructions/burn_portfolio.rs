use anchor_lang::prelude::*;
use anchor_spl::token::{ Mint, Token, TokenAccount, Transfer, transfer};
use crate::{
    ID,
    err::BiscuitError,
    state::{
        config::BiscuitVault,
        portfolio::{BurnModel, PortfolioState, Portfolio, PortfolioCollection}
    }
};

#[derive(Accounts)]
#[instruction(_id: u8, _portfolio_id: u8)]
pub struct BurnPortfolio<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(mut, 
        seeds = [b"vault"],
        bump
    )]
    pub vault: Box<Account<'info, BiscuitVault>>,

    #[account(
        mut,
        constraint = vault_account.owner == vault.key(),
        constraint = vault_account.mint == mint.key()
    )]
    pub vault_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"collection", ID.as_ref(), &_portfolio_id.to_le_bytes()],
        bump
    )]
    pub collection: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [b"onchain-data", collection.key().as_ref()],
        bump
    )]
    pub collection_onchaindata: Account<'info, PortfolioCollection>,

    // The PDA is both the address of the mint account and the mint authority
    #[account(
        mut,
        seeds = [
            b"token",
            collection.key().as_ref(),
            &_id.to_le_bytes()
        ],
        bump,
    )]
    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [
            b"onchain-data",
            mint.key().as_ref(),
        ],
        bump,
    )]
    pub portfolio_data: Account<'info, Portfolio>,

    #[account(mut, constraint = user_potrfolio_account.owner == payer.key())]
    pub user_potrfolio_account: Account<'info, TokenAccount>,

    #[account()]
    pub payment_token: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    
    /// CHECK: checked in CPI
    pub sysvar_instructions: UncheckedAccount<'info>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn burn_portfolio<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info,
    BurnPortfolio<'info>>,   
    _id: u8,  
    _portfolio_id: u8,
    model: BurnModel,
) -> Result<()> {

    if ctx.accounts.portfolio_data.state != PortfolioState::Completed {
        return Err(BiscuitError::InvalidState.into());
    };

    let cpi_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.user_potrfolio_account.to_account_info(),
            to: ctx.accounts.vault_account.to_account_info(),
            authority: ctx.accounts.payer.to_account_info(),
        }
    );
    transfer(cpi_ctx, 1)?;

    let portfolio_data = &mut ctx.accounts.portfolio_data;
    portfolio_data.state = PortfolioState::Burning;
    portfolio_data.burn_params.burn_model = Some(model);
    portfolio_data.burn_params.seller = *ctx.accounts.payer.key;
    portfolio_data.burn_params.burn_payment_token = ctx.accounts.payment_token.key();
   
    Ok(())
}

