use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token};
use mpl_token_metadata::{
    instructions::{CreateV1Cpi, CreateV1CpiAccounts, CreateV1InstructionArgs},
    types::{CollectionDetails, PrintSupply, TokenStandard},
};
use crate::err::BiscuitError;

 
#[derive(Accounts)]
pub struct CreatePortfolio<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    // The PDA is both the address of the mint account and the mint authority
    #[account(
        init,
        seeds = [b"collection"],
        bump,
        payer = authority,
        mint::decimals = 0,
        mint::authority = authority,
        mint::freeze_authority = authority,
    )]
    pub collection_mint: Account<'info, Mint>,

    ///CHECK: Using "address" constraint to validate metadata account address
    #[account(
        mut,
        seeds = [b"metadata", mpl_token_metadata::ID.as_ref(), collection_mint.key().as_ref()],
        seeds::program = mpl_token_metadata::ID,
        bump,
    )]
    pub metadata_account: UncheckedAccount<'info>,

    ///CHECK: Using "address" constraint to validate metadata account address
    #[account(
        mut,
        seeds = [b"metadata", mpl_token_metadata::ID.as_ref(), collection_mint.key().as_ref(), b"edition"],
        seeds::program = mpl_token_metadata::ID,
        bump,
    )]
    pub master_edition_account: UncheckedAccount<'info>,

    #[account(
        init,
        payer = authority,
        space = 106, 
        seeds = [b"onchain-data", metadata_account.key().as_ref()],
        bump
    )]
    pub portfolio_metadata: Account<'info, PortfolioCollectionData>, 
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
    bump: u8,
}

pub fn create_portfolio(
    ctx: Context<CreatePortfolio>,
    name: String,
    symbol: String,
    uri: String,
    tokens: Vec<Pubkey>,
    percentages: Vec<u8>
) -> Result<()> {
    // Confiugure these args as you wish
    if tokens.len()!= percentages.len(){
        return err!(BiscuitError::DataLengthMissmatch);
    }
    
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

    let token_program = &ctx.accounts.token_program.to_account_info();
    let metadata = &ctx.accounts.metadata_account.to_account_info();
    let collection_mint = &ctx.accounts.collection_mint.to_account_info();
    let authority = &ctx.accounts.authority.to_account_info();
    let system_program = &ctx.accounts.system_program.to_account_info();
    let sysvar_instructions = &ctx.accounts.sysvar_instructions.to_account_info();
    let master_edition = &ctx.accounts.master_edition_account.to_account_info();
    let mpl_program = &ctx.accounts.mpl_program.to_account_info();

    let create_cpi = CreateV1Cpi::new(
        mpl_program,
        CreateV1CpiAccounts {
            metadata: metadata,
            master_edition: Some(master_edition),
            mint: (collection_mint, true),
            authority: authority,
            payer: authority,
            update_authority: (authority, true),
            system_program: system_program,
            sysvar_instructions: sysvar_instructions,
            spl_token_program: Some(token_program),
        },
        args,
    );

    let seeds: &[&[&[u8]]] = &[
        &[
            "collection".as_bytes(),
            &[ctx.bumps.collection_mint],
        ],
    ];

    msg!("Invoke signed");
    let _= create_cpi.invoke_signed(seeds);

    // let mut data: &[u8] = &metadata.try_borrow_data()?;
    // let acc = Metadata::from_bytes(&mut data)?;

    let portfolio_data = &mut ctx.accounts.portfolio_metadata;
    portfolio_data.tokens = tokens;
    portfolio_data.percentages = percentages;
    portfolio_data.bump = ctx.bumps.portfolio_metadata;  

    Ok(())
}