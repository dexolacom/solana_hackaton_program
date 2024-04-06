use anchor_lang::prelude::*;
use anchor_spl::{associated_token::AssociatedToken, token::{ Mint, Token, TokenAccount, Transfer, transfer, close_account}};
use mpl_token_metadata::{
    accounts::Metadata, instructions::{ BurnV1Cpi, BurnV1CpiAccounts, BurnV1InstructionArgs}, types::{Collection, PrintSupply, TokenStandard}
};
use crate::portfolio::PortfolioCollectionData;
use whirlpool_cpi::{self};

#[derive(Accounts)]
#[instruction(_id: u8)]
pub struct BurnPortfolio<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(mut)]
    pub collection: Account<'info, Mint>,

    #[account(mut)]
    pub collection_onchaindata: Account<'info, PortfolioCollectionData>,

    /// CHECK:
    #[account(mut)]
    pub collection_metadata: UncheckedAccount<'info>,

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
    pub token_mint: Account<'info, Mint>,

    ///CHECK: Using "address" constraint to validate metadata account address
    #[account(
        mut,
        seeds = [b"metadata", mpl_token_metadata::ID.as_ref(), token_mint.key().as_ref()],
        seeds::program = mpl_token_metadata::ID,
        bump,
    )]
    pub metadata_account: UncheckedAccount<'info>,

    ///CHECK: Using "address" constraint to validate metadata account address
    #[account(
        mut,
        seeds = [b"metadata", mpl_token_metadata::ID.as_ref(), token_mint.key().as_ref(), b"edition"],
        seeds::program = mpl_token_metadata::ID,
        bump,
    )]
    pub master_edition_account: UncheckedAccount<'info>,

    /// CHECK: 
    #[account(mut, constraint = nft_user_token_account.owner == payer.key())]
    pub nft_user_token_account: Account<'info, TokenAccount>,

    /// CHECK: 
    #[account(mut)]
    pub nft_record: UncheckedAccount<'info>,

    /// CHECK: checked in CPI
    pub mpl_program: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub spl_ata_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    
    /// CHECK: checked in CPI
    pub sysvar_instructions: UncheckedAccount<'info>,

    pub rent: Sysvar<'info, Rent>,
}

pub fn burn_portfolio<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, BurnPortfolio<'info>>,   
    _id: u8,  
) -> Result<()> {

    let dest_ata_accs  = ctx.remaining_accounts;
    let length = ctx.accounts.collection_onchaindata.tokens.len();
    let collection = &ctx.accounts.collection.to_account_info();
    let collection_key = collection.key();
    let seeds: &[&[&[u8]]] = &[&[
        "token".as_bytes(),
        collection_key.as_ref(),
        &_id.to_le_bytes(),
        &[ctx.bumps.token_mint]
    ]];

    for i in 0..length {
        let nft_ata = dest_ata_accs[0+i*2].to_account_info();
        let user_ata = dest_ata_accs[1+i*2].to_account_info();
        
        let mut acc = TokenAccount::try_deserialize(&mut &**nft_ata.try_borrow_data()?)?;

        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: nft_ata.to_account_info(),
                to: user_ata.to_account_info(),
                authority: ctx.accounts.token_mint.to_account_info(),
            },
            seeds
        );
        msg!("Biscuit: transfer");
        transfer(cpi_ctx, acc.amount)?;

        let cpi_accounts = anchor_spl::token::CloseAccount {
            account: nft_ata.clone(),
            destination: ctx.accounts.payer.to_account_info().clone(),
            authority: ctx.accounts.token_mint.to_account_info().clone(),
        };

        let cpi_program = ctx.accounts.token_program.to_account_info().clone();
        let close_cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, seeds);
        close_account(close_cpi_ctx)?;
    }

    burn_nft(
        ctx, 
        _id, 
    );
    Ok(())
}

pub fn burn_nft(
    ctx: Context<BurnPortfolio>,     
    _id: u8,
) -> () {

    let args = BurnV1InstructionArgs {
        amount: 1
    };

    let payer = &ctx.accounts.payer.to_account_info();
    let token_program = &ctx.accounts.token_program.to_account_info();
    let metadata = &ctx.accounts.metadata_account.to_account_info();
    let token_mint = &ctx.accounts.token_mint.to_account_info();
    let system_program = &ctx.accounts.system_program.to_account_info();
    let sysvar_instructions = &ctx.accounts.sysvar_instructions.to_account_info();
    let master_edition = &ctx.accounts.master_edition_account.to_account_info();
    let mpl_program = &ctx.accounts.mpl_program.to_account_info();
    let collection = &ctx.accounts.collection.to_account_info();
    let collection_key = collection.key();
    let collection_metadata = &ctx.accounts.collection_metadata.to_account_info();
    let nft_ata = &ctx.accounts.nft_user_token_account.to_account_info();

    let burn_cpi = BurnV1Cpi::new(
        mpl_program,
        BurnV1CpiAccounts {
            token: nft_ata,
            token_record: None,
            metadata: metadata,
            master_edition: None,
            mint: token_mint,
            authority: payer,
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
    
    let seeds: &[&[&[u8]]] = &[&[
        "token".as_bytes(),
        collection_key.as_ref(),
        &_id.to_le_bytes(),
        &[ctx.bumps.token_mint]
    ]];

    msg!("Invoke signed");
    // let _ = burn_cpi.invoke();
    let _ = burn_cpi.invoke_signed(seeds);
}
