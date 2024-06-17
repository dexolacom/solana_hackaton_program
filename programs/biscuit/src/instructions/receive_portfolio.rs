use anchor_lang::prelude::*;
use anchor_spl::token::{transfer, Mint, Token, TokenAccount, Transfer};
use crate::{
    ID,
    err::BiscuitError,
    state::{
        config::BiscuitVault,
        portfolio::{Portfolio, PortfolioState, PortfolioCollection}
    }
};

#[derive(Accounts)]
#[instruction(_id: u8, _portfolio_id: u8)]
pub struct ReceivePortfolio<'info> {
    #[account(mut,
        address = portfolio_data.buyer
    )]
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

    #[account(mut,
        seeds = [b"onchain-data", mint.key().as_ref()],
        bump,
    )]
    pub portfolio_data: Account<'info, Portfolio>,

    #[account(
        mut,
        constraint = receiver_account.owner == portfolio_data.buyer,
        constraint = receiver_account.mint == mint.key()
    )]
    pub receiver_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    
    /// CHECK: checked in CPI
    pub sysvar_instructions: UncheckedAccount<'info>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn receive_portfolio<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, ReceivePortfolio<'info>>,   
    _id: u8,  
    _portfolio_id: u8,
) -> Result<()> {
    if ctx.accounts.portfolio_data.state != PortfolioState::Init {
        return Err(BiscuitError::PortfolioAlreadyReceived.into());
    }

    let portfoilio_length = ctx.accounts.collection_onchaindata.tokens.len();

    if ctx.accounts.portfolio_data.swap_index as usize != portfoilio_length {
        return Err(BiscuitError::PortfolioNotCompleted.into());
    }

    let seeds: &[&[&[u8]]] = &[&[
        "vault".as_bytes(),
        &[ctx.bumps.vault]
    ]];

    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.vault_account.to_account_info(),
            to: ctx.accounts.receiver_account.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(),
        },
        seeds
    );
    msg!("Biscuit: Transferring portfolio to buyer");
    transfer(cpi_ctx, 1)?;

    ctx.accounts.portfolio_data.state = PortfolioState::Completed;

    Ok(())
}
