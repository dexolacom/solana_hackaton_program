use anchor_lang::prelude::*;
use anchor_spl::token::{transfer, Mint, Token, TokenAccount, Transfer};
use mpl_token_metadata::{
    ID as MPL_TOKEN_METADATA_ID,
    instructions::{VerifyCollectionV1Cpi, VerifyCollectionV1CpiAccounts}, 
};
use crate::{
    ID,
    err::BiscuitError,
    state::{
        mpl::MplMetadata,
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

    /// CHECK: checked in CPI
    #[account(
        mut,
        seeds = [b"metadata", MPL_TOKEN_METADATA_ID.as_ref(), collection.key().as_ref()],
        seeds::program = MPL_TOKEN_METADATA_ID,
        bump,
    )]
    pub collection_metadata:UncheckedAccount<'info>,

    /// CHECK: checked in CPI
    #[account(
        mut,
        seeds = [b"metadata", MPL_TOKEN_METADATA_ID.as_ref(), collection.key().as_ref(), b"edition"],
        seeds::program = MPL_TOKEN_METADATA_ID,
        bump,
    )]
    pub collection_master_edition:UncheckedAccount<'info>,
    
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

    ///CHECK: Using "address" constraint to validate metadata account address
    #[account(
        mut,
        seeds = [b"metadata", mpl_token_metadata::ID.as_ref(), mint.key().as_ref()],
        seeds::program = mpl_token_metadata::ID,
        bump,
    )]
    pub metadata: UncheckedAccount<'info>,

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
    pub mpl_program: Program<'info, MplMetadata>,
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

    let verify_seeds: &[&[&[u8]]] = &[
        &[
            "collection".as_bytes(),
            crate::ID.as_ref(),
            &_portfolio_id.to_le_bytes(),
            &[ctx.accounts.collection_onchaindata.bump],
        ],
    ];

    let mpl_program = &ctx.accounts.mpl_program.to_account_info();
    let collection = &ctx.accounts.collection.to_account_info();
    let metadata = &ctx.accounts.metadata.to_account_info();
    let collection_metadata = &ctx.accounts.collection_metadata.to_account_info();
    let collection_master_edition = &ctx.accounts.collection_master_edition.to_account_info();
    let system_program = &ctx.accounts.system_program.to_account_info();
    let sysvar_instructions = &ctx.accounts.sysvar_instructions.to_account_info();

    let verify_cpi = VerifyCollectionV1Cpi::new( 
        mpl_program,
        VerifyCollectionV1CpiAccounts {
            authority: collection,
            delegate_record: None,
            metadata: metadata,
            collection_mint: collection,
            collection_metadata: Some(collection_metadata),
            collection_master_edition: Some(collection_master_edition),
            system_program: system_program,
            sysvar_instructions: sysvar_instructions,
        }
    );
    msg!("Biscuit: verify portfolio collection");
    let _ = verify_cpi.invoke_signed(verify_seeds);

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
