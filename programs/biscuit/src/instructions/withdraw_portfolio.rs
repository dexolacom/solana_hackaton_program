use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::{get_associated_token_address ,AssociatedToken}, 
    token::{ Mint, Token, TokenAccount, Transfer, transfer, close_account}
};
use mpl_token_metadata::instructions:: {BurnV1Cpi, BurnV1CpiAccounts, BurnV1InstructionArgs};
use crate::{
    err::BiscuitError, state::{
        config::{BiscuitConfig, BiscuitVault, FEE_PRECISION}, mpl::MplMetadata, portfolio::{BurnModel, Portfolio, PortfolioCollection}
    }, ID
};

#[derive(Accounts)]
#[instruction(_id: u8, _portfolio_id: u8)]
pub struct WithdrawPortfolio<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(mut, 
        seeds = [b"config"],
        bump
    )]
    pub config: Box<Account<'info, BiscuitConfig>>,

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

    ///CHECK: Using "address" constraint to validate metadata account address
    #[account(
        mut,
        seeds = [b"metadata", mpl_token_metadata::ID.as_ref(), collection.key().as_ref()],
        seeds::program = mpl_token_metadata::ID,
        bump,
    )]
    pub collection_metadata: UncheckedAccount<'info>,

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

    ///CHECK: Using "address" constraint to validate metadata account address
    #[account(
        mut,
        seeds = [b"metadata", mpl_token_metadata::ID.as_ref(), mint.key().as_ref(), b"edition"],
        seeds::program = mpl_token_metadata::ID,
        bump,
    )]
    pub master_edition: UncheckedAccount<'info>,

    /// CHECK: 
    #[account(mut)]
    pub record: UncheckedAccount<'info>,

    #[account(mut,
        seeds = [b"onchain-data", mint.key().as_ref()],
        bump,
    )]
    pub portfolio_data: Account<'info, Portfolio>,

    pub mpl_program: Program<'info, MplMetadata>,
    pub token_program: Program<'info, Token>,
    pub spl_ata_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    
    /// CHECK: checked in CPI
    pub sysvar_instructions: UncheckedAccount<'info>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn withdraw_portfolio<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, WithdrawPortfolio<'info>>,   
    _id: u8,
    _portfolio_id: u8,
) -> Result<()> {

    if ctx.accounts.portfolio_data.burn_params.burn_model == None {
        return Err(BiscuitError::InvalidState.into());
    }
    let collection = &ctx.accounts.collection.to_account_info();
    let collection_key = collection.key();
    let seeds: &[&[&[u8]]] = &[&[
        "token".as_bytes(),
        collection_key.as_ref(),
        &_id.to_le_bytes(),
        &[ctx.bumps.mint]
    ]];

    if ctx.accounts.portfolio_data.burn_params.burn_model == Some(BurnModel::Raw) {
        let dest_ata_accs  = ctx.remaining_accounts;
        let length = ctx.accounts.collection_onchaindata.tokens.len();
        if length != dest_ata_accs.len()/3 {
            return Err(BiscuitError::InvalidRemainingAccountLength.into());
        }

        for i in 0..length {
            let offset = i *3;
            let nft_ata = dest_ata_accs[0+offset].to_account_info();
            let expected_nft_ata = get_associated_token_address(&ctx.accounts.mint.key(), &ctx.accounts.collection_onchaindata.tokens[i]);
            if nft_ata.key() != expected_nft_ata.key() {
                return Err(BiscuitError::InvalidNFTTokenAccount.into());
            }

            let user_ata = dest_ata_accs[1+offset].to_account_info();
            let expected_user_ata = get_associated_token_address(&ctx.accounts.portfolio_data.burn_params.seller, &ctx.accounts.collection_onchaindata.tokens[i]);
            if user_ata.key() != expected_user_ata.key() {
                return Err(BiscuitError::InvalidUserTokenAccount.into());
            } 

            let treasury_ata = dest_ata_accs[2+offset].to_account_info();
            let expected_treasury_ata = get_associated_token_address(&ctx.accounts.config.treasury, &ctx.accounts.collection_onchaindata.tokens[i]);
            if treasury_ata.key() != expected_treasury_ata.key() {
                return Err(BiscuitError::InvalidTreasuryTokenAccount.into());
            }

            let acc = TokenAccount::try_deserialize(&mut &**nft_ata.try_borrow_data()?)?;
            let fee = acc.amount * ctx.accounts.collection_onchaindata.fee_out as u64 / FEE_PRECISION; 
            let amount = acc.amount - fee;

            let cpi_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: nft_ata.to_account_info(),
                    to: treasury_ata.to_account_info(),
                    authority: ctx.accounts.mint.to_account_info(),
                },
                seeds
            );
            msg!("Biscuit: Transfer token {} to treasury", ctx.accounts.collection_onchaindata.tokens[i].key());
            transfer(cpi_ctx, fee)?;
    
            let cpi_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: nft_ata.to_account_info(),
                    to: user_ata.to_account_info(),
                    authority: ctx.accounts.mint.to_account_info(),
                },
                seeds
            );
            msg!("Biscuit: Transfer token {} to user", ctx.accounts.collection_onchaindata.tokens[i].key());
            transfer(cpi_ctx, amount)?;
    
            let cpi_accounts = anchor_spl::token::CloseAccount {
                account: nft_ata.clone(),
                destination: ctx.accounts.payer.to_account_info().clone(),
                authority: ctx.accounts.mint.to_account_info().clone(),
            };
    
            let cpi_program = ctx.accounts.token_program.to_account_info().clone();
            let close_cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, seeds);
            close_account(close_cpi_ctx)?;
        }
    
    }

    if ctx.accounts.portfolio_data.burn_params.burn_model == Some(BurnModel::Swap) {
        if ctx.accounts.portfolio_data.burn_params.swap_index as usize != ctx.accounts.collection_onchaindata.tokens.len() {
            return Err(BiscuitError::InvalidState.into());
        }

        if ctx.remaining_accounts.len() != 3 {
            return Err(BiscuitError::InvalidRemainingAccountLength.into());
        }

        let nft_vault = ctx.remaining_accounts[0].to_account_info();
        let expected_nft_vault = get_associated_token_address(&ctx.accounts.mint.key(), &ctx.accounts.portfolio_data.burn_params.burn_payment_token);

        if nft_vault.key() != expected_nft_vault.key() {
            return Err(BiscuitError::InvalidNFTTokenAccount.into());
        }

        let user_ata = ctx.remaining_accounts[1].to_account_info();
        let expected_user_ata = get_associated_token_address(&ctx.accounts.portfolio_data.burn_params.seller, &ctx.accounts.portfolio_data.burn_params.burn_payment_token);

        if user_ata.key() != expected_user_ata.key() {
            return Err(BiscuitError::InvalidUserTokenAccount.into());
        }

        let treasury_ata = ctx.remaining_accounts[2].to_account_info();
        let expected_treasury_ata = get_associated_token_address(&ctx.accounts.config.treasury, &ctx.accounts.portfolio_data.burn_params.burn_payment_token);
        if treasury_ata.key() != expected_treasury_ata.key() {
            return Err(BiscuitError::InvalidTreasuryTokenAccount.into());
        }

        let acc = TokenAccount::try_deserialize(&mut &**nft_vault.try_borrow_data()?)?;
        let fee = acc.amount * ctx.accounts.collection_onchaindata.fee_out as u64 / FEE_PRECISION;
        let amount = acc.amount - fee;

        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: nft_vault.to_account_info(),
                to: treasury_ata.to_account_info(),
                authority: ctx.accounts.mint.to_account_info(),
            },
            seeds
        );
        msg!("Biscuit: Transfer payment token from portfolio to treasury");
        transfer(cpi_ctx, fee)?;


        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: nft_vault.to_account_info(),
                to: user_ata.to_account_info(),
                authority: ctx.accounts.mint.to_account_info(),
            },
            seeds
        );
        msg!("Biscuit: Transfer payment token from portfolio to user");
        transfer(cpi_ctx, amount)?;
    }

    burn_nft(
        ctx, 
        _id, 
    );

    Ok(())
}

pub fn burn_nft(
    ctx: Context<WithdrawPortfolio>,     
    _id: u8,
) -> () {

    let args = BurnV1InstructionArgs {
        amount: 1
    };

    let vault = &ctx.accounts.vault.to_account_info();
    let token_program = &ctx.accounts.token_program.to_account_info();
    let metadata = &ctx.accounts.metadata.to_account_info();
    let mint = &ctx.accounts.mint.to_account_info();
    let system_program = &ctx.accounts.system_program.to_account_info();
    let sysvar_instructions = &ctx.accounts.sysvar_instructions.to_account_info();
    let master_edition = &ctx.accounts.master_edition.to_account_info();
    let mpl_program = &ctx.accounts.mpl_program.to_account_info();
    let collection = &ctx.accounts.collection.to_account_info();
    let collection_key = collection.key();
    let collection_metadata = &ctx.accounts.collection_metadata.to_account_info();
    let nft_ata = &ctx.accounts.vault_account.to_account_info();

    let burn_cpi = BurnV1Cpi::new(
        mpl_program,
        BurnV1CpiAccounts {
            token: nft_ata,
            token_record: None,
            metadata: metadata,
            master_edition: None,
            mint: mint,
            authority: vault,
            system_program: system_program,
            sysvar_instructions: sysvar_instructions,
            spl_token_program: token_program,
            collection_metadata: Some(collection_metadata),
            edition: Some(master_edition),
            master_edition_mint: None,
            master_edition_token: None,
            edition_marker: None,
        },
        args,
    );
    
    let seeds: &[&[&[u8]]] = &[
        
    &[
        "token".as_bytes(),
        collection_key.as_ref(),
        &_id.to_le_bytes(),
        &[ctx.bumps.mint]
    ],
    &[
        "vault".as_bytes(),
        &[ctx.bumps.vault]
    ]
    ];

    msg!("Biscuit: Burn invoke signed");
    let _ = burn_cpi.invoke_signed(seeds);
}
