use anchor_lang::prelude::*;
use std::string::String;
use anchor_spl::token::{Mint, Token};
use mpl_token_metadata::{
    instructions::{CreateV1Cpi, CreateV1CpiAccounts, CreateV1InstructionArgs},
    types::{CollectionDetails, PrintSupply, TokenStandard},
};
use crate::err::BiscuitError;
use crate::config::BiscuitConfig;
use crate::ID;

#[derive(Accounts)]
#[instruction(portfolio_id: u8)]
pub struct CreatePortfolio<'info> {
    #[account(mut, seeds = [b"config"], bump)]
    pub config: Account<'info, BiscuitConfig>,

    #[account(mut, address = config.admin_authority)]
    pub signer: Signer<'info>,

    // #[account(mut)]
    // pub authority: UncheckedAccount<'info>,

    // The PDA is both the address of the mint account and the mint authority
    #[account(
        init,
        seeds = [b"collection", ID.as_ref(), &portfolio_id.to_le_bytes()],
        bump,
        payer = signer,
        mint::decimals = 0,
        mint::authority = mint,
        mint::freeze_authority = mint,
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

    #[account(
        init,
        payer = signer,
        space = 500, 
        seeds = [b"onchain-data", mint.key().as_ref()],
        bump
    )]
    pub onchain_data: Account<'info, PortfolioCollectionData>, 
    
    /// CHECK: checked in CPI
    pub mpl_program: UncheckedAccount<'info>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
    
    /// CHECK: checked in CPI
    pub sysvar_instructions: UncheckedAccount<'info>,
}

#[account]
#[derive(Default)]
pub struct PortfolioCollectionData {
    pub tokens: Vec<Pubkey>,
    pub percentages: Vec<u8>,
    pub fee_in: u8,
    pub fee_out: u8,
    pub bump: u8,
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
    // Confiugure these args as you wish
    if tokens.len()!= percentages.len(){
        return err!(BiscuitError::DataLengthMissmatch);
    }

    let name = String::from("PortfolioCollection") + &portfolio_id.to_string();
    let symbol = String::from("BPC");

    let args = CreateV1InstructionArgs {
        name,
        symbol,
        uri,
        seller_fee_basis_points: 0,
        primary_sale_happened: false,
        is_mutable: true,
        token_standard: TokenStandard::ProgrammableNonFungible,
        collection: None,
        uses: None,
        collection_details: Some(CollectionDetails::V1 { size: 0 }),
        creators: None,
        rule_set: None,
        decimals: Some(0),
        print_supply: Some(PrintSupply::Zero),
    };

    let signer = &ctx.accounts.signer.to_account_info();
    let token_program = &ctx.accounts.token_program.to_account_info();
    let metadata = &ctx.accounts.metadata.to_account_info();
    let collection_mint = &ctx.accounts.mint.to_account_info();
    // let authority = &ctx.accounts.authority.to_account_info();
    let system_program = &ctx.accounts.system_program.to_account_info();
    let sysvar_instructions = &ctx.accounts.sysvar_instructions.to_account_info();
    let master_edition = &ctx.accounts.master_edition.to_account_info();
    let mpl_program = &ctx.accounts.mpl_program.to_account_info();

    let create_cpi = CreateV1Cpi::new(
        mpl_program,
        CreateV1CpiAccounts {
            metadata: metadata,
            master_edition: Some(master_edition),
            mint: (collection_mint, true),
            authority: collection_mint,
            payer: signer,
            update_authority: (collection_mint, true),
            system_program: system_program,
            sysvar_instructions: sysvar_instructions,
            spl_token_program: Some(token_program),
        },
        args,
    );

    let seeds: &[&[&[u8]]] = &[
        &[
            "collection".as_bytes(),
            ID.as_ref(),
            &portfolio_id.to_le_bytes(),
            &[ctx.bumps.mint],
        ],
    ];

    msg!("Invoke signed create ccolletion");
    let _= create_cpi.invoke_signed(seeds);

    let portfolio_data = &mut ctx.accounts.onchain_data;
    portfolio_data.tokens = tokens;
    portfolio_data.percentages = percentages;
    portfolio_data.fee_in = fee_in;
    portfolio_data.fee_out = fee_out;  
    portfolio_data.bump = ctx.bumps.mint;

    Ok(())
}