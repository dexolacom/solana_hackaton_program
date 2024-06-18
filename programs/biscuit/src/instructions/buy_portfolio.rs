use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::{self, AssociatedToken},
    token::{ Mint, Token, TokenAccount, Transfer, transfer}};
use mpl_token_metadata::{
    instructions::{CreateV1Cpi, CreateV1CpiAccounts, CreateV1InstructionArgs, MintV1Cpi, MintV1CpiAccounts, MintV1InstructionArgs}, 
    types::{Collection, PrintSupply, TokenStandard}
};
use crate::{
    ID,
    state::{
        config::{BiscuitConfig, BiscuitVault, FEE_PRECISION}, mpl::MplMetadata, portfolio::{BurnParameters, Portfolio, PortfolioCollection, PortfolioState}
    }, 
};

#[derive(Accounts)]
#[instruction(_id: u8, _portfolio_id: u8)]
pub struct BuyPortfolio<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(mut, 
        seeds = [b"config"],
        bump
    )]
    pub config: Box<Account<'info, BiscuitConfig>>,

    #[account(
        seeds = [b"vault"],
        bump,
    )]
    pub vault: Box<Account<'info, BiscuitVault>>,

    /// CHECK: create in program
    #[account(mut)]
    pub vault_account: UncheckedAccount<'info>,

    #[account(
        mut, 
        constraint = treasury_account.owner == config.treasury,
        constraint = treasury_account.mint == payment_token.key()
    )]
    pub treasury_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut, // Check
        seeds = [b"collection", ID.as_ref(), &_portfolio_id.to_le_bytes()],
        bump
    )]
    pub collection: Box<Account<'info, Mint>>,

    #[account(
        mut,
        seeds = [b"onchain-data", collection.key().as_ref()],
        bump
    )]
    pub collection_onchaindata: Box<Account<'info, PortfolioCollection>>,

    // The PDA is both the address of the mint account and the mint authority
    #[account(
        init,
        seeds = [
            b"token",
            collection.key().as_ref(),
            &_id.to_le_bytes()
        ],
        bump,
        payer = payer,
        mint::decimals = 0,
        mint::authority = mint,
        mint::freeze_authority = mint,
    )]
    pub mint: Box<Account<'info, Mint>>,

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

    /// CHECK: Checked in CPI 
    #[account(mut)]
    pub record: UncheckedAccount<'info>,

    #[account(
        init,
        seeds = [
            b"onchain-data",
            mint.key().as_ref(),
        ],
        bump,
        space = 200,
        payer = payer,
    )]
    pub portfolio_data: Account<'info, Portfolio>,

    #[account(
        mut,
        constraint = funding_account.mint == payment_token.key()
    )]
    pub funding_account: Box<Account<'info, TokenAccount>>,

    pub payment_token: Box<Account<'info, Mint>>,

    /// CHECK: checked in CPI
    #[account(mut)]
    pub portfolio_payment_account: UncheckedAccount<'info>,

    pub mpl_program: Program<'info, MplMetadata>,
    pub token_program: Program<'info, Token>,
    pub spl_ata_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    
    /// CHECK: checked in CPI
    pub sysvar_instructions: UncheckedAccount<'info>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn buy_portfolio<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, BuyPortfolio<'info>>,   
    _id: u8,  
    _portfolio_id: u8,
    uri: String,
    amount: u64,
) -> Result<()> {

    // SEND FEE TO TREASURY
    let fee_amount = amount * ctx.accounts.collection_onchaindata.fee_in as u64/ FEE_PRECISION;
    let cpi_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.funding_account.to_account_info(),
            to: ctx.accounts.treasury_account.to_account_info(),
            authority: ctx.accounts.payer.to_account_info(),
        },
    );
    msg!("Biscuit: transfer fee to treasury");
    transfer(cpi_ctx, fee_amount)?;

    let new_amount = amount - fee_amount;
    let data = &mut ctx.accounts.portfolio_data;

    data.payment_token = ctx.accounts.payment_token.key();
    data.payment_amount = new_amount;
    data.state = PortfolioState::Init;
    data.swap_index = 0;
    data.buyer = ctx.accounts.payer.key();
    data.burn_params = BurnParameters::default();

    let name = String::from("BiscuitPortfolio") + &_id.to_string();
    let symbol = String::from("BPT");

    let collection_data = Collection {
        verified: false,
        key: ctx.accounts.collection.key(),
    };

    let args = CreateV1InstructionArgs {
        name,
        symbol,
        uri,
        seller_fee_basis_points: 0,
        primary_sale_happened: false,
        is_mutable: true,
        token_standard: TokenStandard::NonFungible,
        collection: Some(collection_data),
        uses: None,
        collection_details: None,
        creators: None,
        rule_set: None,
        decimals: Some(0),
        print_supply: Some(PrintSupply::Zero),
    };

    let payer = &ctx.accounts.payer.to_account_info();
    let token_program = &ctx.accounts.token_program.to_account_info();
    let metadata = &ctx.accounts.metadata.to_account_info();
    let mint = &ctx.accounts.mint.to_account_info();
    let system_program = &ctx.accounts.system_program.to_account_info();
    let sysvar_instructions = &ctx.accounts.sysvar_instructions.to_account_info();
    let master_edition = &ctx.accounts.master_edition.to_account_info();
    let mpl_program = &ctx.accounts.mpl_program.to_account_info();
    let collection = &ctx.accounts.collection.to_account_info();
    let collection_key = collection.key();
    let nft_ata = &ctx.accounts.vault_account.to_account_info();
    let nft_record = &ctx.accounts.record.to_account_info();
    let spl_ata_program = &ctx.accounts.spl_ata_program.to_account_info();
    let vault = &ctx.accounts.vault.to_account_info();

    let create_cpi = CreateV1Cpi::new(
        mpl_program,
        CreateV1CpiAccounts {
            metadata: metadata,
            master_edition: Some(master_edition),
            mint: (mint, true),
            authority: mint,
            payer: payer,
            update_authority: (mint, true),
            system_program: system_program,
            sysvar_instructions: sysvar_instructions,
            spl_token_program: Some(token_program),
        },
        args,
    );
    let bump = ctx.bumps.mint;
    let seeds: &[&[&[u8]]] = &[&[
        "token".as_bytes(),
        collection_key.as_ref(),
        &_id.to_le_bytes(),
        &[bump]
    ]];
    msg!("Biscuit: Create portfolio");
    // When using pda signer:
    let _ = create_cpi.invoke_signed(seeds);

    msg!("Biscuit: Creating portfolio payment associated token account");
    // Create the associated token account
    let _ = associated_token::create(CpiContext::new(
        ctx.accounts.spl_ata_program.to_account_info(),
        associated_token::Create {
            payer: ctx.accounts.payer.to_account_info(),
            associated_token: ctx.accounts.portfolio_payment_account.to_account_info(),
            authority: ctx.accounts.mint.to_account_info(),
            mint: ctx.accounts.payment_token.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
            token_program: ctx.accounts.token_program.to_account_info(),
        },
    ));

    // SEND AMOUNT TO VAULT
    let cpi_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.funding_account.to_account_info(),
            to: ctx.accounts.portfolio_payment_account.to_account_info(),
            authority: ctx.accounts.payer.to_account_info(),
        },
    );
    msg!("Biscuit: transfer amount to portfolio vault");
    transfer(cpi_ctx, new_amount)?;
    
    msg!("Biscuit: Creating vault nft associated token account");
    // Create the associated token account
    let _ = associated_token::create(CpiContext::new(
        ctx.accounts.spl_ata_program.to_account_info(),
        associated_token::Create {
            payer: ctx.accounts.payer.to_account_info(),
            associated_token: ctx.accounts.vault_account.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
            token_program: ctx.accounts.token_program.to_account_info(),
        },
    ));

    let mint_args = MintV1InstructionArgs {
        amount: 1,
        authorization_data: None
    };
    
    let mint_cpi = MintV1Cpi::new(
        mpl_program,
        MintV1CpiAccounts {
            token: nft_ata,
            token_owner: Some(vault),
            token_record: Some(nft_record),
            delegate_record: None,
            spl_ata_program: spl_ata_program,
            authorization_rules: None,
            authorization_rules_program: None,
            metadata: metadata,
            master_edition: Some(master_edition),
            mint: mint,
            authority: mint,
            payer: payer,
            system_program: system_program,
            sysvar_instructions: sysvar_instructions,
            spl_token_program: token_program,
        },
        mint_args,
    );
    msg!("Biscuit: mint portfolio token");
    let _ = mint_cpi.invoke_signed(seeds);

    Ok(())
}
