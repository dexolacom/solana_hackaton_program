use anchor_lang::prelude::*;
use borsh::{BorshSerialize, BorshDeserialize};
use anchor_spl::{associated_token::AssociatedToken, token::{transfer, Mint, Token, Transfer}};
use mpl_token_metadata::{
    instructions::{CreateV1Cpi, CreateV1CpiAccounts, CreateV1InstructionArgs, MintV1Cpi, MintV1CpiAccounts, MintV1InstructionArgs},
    types::{Collection, PrintSupply, TokenStandard},
};
use crate::portfolio::PortfolioCollectionData;

#[derive(Accounts)]
#[instruction(_id: u8)]
pub struct BuyPortfolio<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(mut)]
    pub collection: Account<'info, Mint>,

    #[account(mut)]
    pub collection_metadata: Account<'info, PortfolioCollectionData>,

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
        mint::authority = token_mint,
        mint::freeze_authority = token_mint,
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

    #[account(
        init,
        payer = payer,
        space = 106, 
        seeds = [b"onchain-data", metadata_account.key().as_ref()],
        bump
    )]
    pub portfolio_data: Account<'info, PortfolioData>, 

    #[account(mut)]
    pub payment_token: Account<'info, Mint>,

    /// CHECK:
    #[account(mut)]
    pub payment_user_token_account: AccountInfo<'info>, // Аккаунт USDT пользователя

    /// CHECK:
    #[account(mut)]
    pub payment_program_token_account: AccountInfo<'info>, 


    /// CHECK: 
    #[account(mut)]
    pub nft_user_token_account: UncheckedAccount<'info>,

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

#[derive(Debug, Default, BorshSerialize, BorshDeserialize)]
pub struct BuyPortfolioCollectionData {
    uri: String,
    amount: u64,
    token: Pubkey
}

#[account]
// #[derive(Default)]
// #[derive( Debug, Default, BorshSerialize, BorshDeserialize, Clone)]
pub struct  PortfolioData{
    token: Pubkey,
    amount: u64,
    assets: Vec<u64>,
    bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum PaymentType {
  SOL,
  Token,
}

pub fn buy_portfolio(ctx: Context<BuyPortfolio>,   
    _id: u8,  
    uri: String,
    amount: u64,
) -> Result<()> {

    let cpi_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.payment_user_token_account.to_account_info(),
            to: ctx.accounts.payment_program_token_account.to_account_info(),
            authority: ctx.accounts.payer.to_account_info(),
        },
    );
    transfer(cpi_ctx, amount)?;
    
    // let mut for_swap: Vec<PortfolioAsset> = Vec::new();
    let mut assets = Vec::new();
    let length = ctx.accounts.collection_metadata.tokens.len();

    for i in 0..length {
        assets.push(ctx.accounts.collection_metadata.percentages[i] as u64 *amount / 1000)
        // for_swap.push(PortfolioAsset {
        //     token: ctx.accounts.collection_metadata.tokens[i],
        //     amount: ctx.accounts.collection_metadata.percentages[i] as u64 *amount / 1000,
        // })
    }

    create_nft(
        ctx, 
        "Portfolio".to_owned(),
        "PRT".to_owned(),
        uri,
        _id, amount,
        assets);


    // create_nft(ctx, )
    // let mut data: &[u8] = &metadata.try_borrow_data()?;
    // let acc = Metadata::from_bytes(&mut data)?;
    // msg!("name: {}", acc.name);
    // msg!("symbol: {}", acc.symbol);
    // let mut data = &metadata.try_borrow_data()?;
    // let m = Metadata::deserialize(&mut data);
    // transfer(ctx.accounts.transfer_nft_ctx(), 1)?;

    Ok(())
}

pub fn create_nft(
    ctx: Context<BuyPortfolio>,     
    name: String,
    symbol: String,
    uri: String,
    _id: u8,
    amount: u64,
    data: Vec<u64>
) -> () {
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
        token_standard: TokenStandard::ProgrammableNonFungible,
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
    let metadata = &ctx.accounts.metadata_account.to_account_info();
    let token_mint = &ctx.accounts.token_mint.to_account_info();
    let system_program = &ctx.accounts.system_program.to_account_info();
    let sysvar_instructions = &ctx.accounts.sysvar_instructions.to_account_info();
    let master_edition = &ctx.accounts.master_edition_account.to_account_info();
    let mpl_program = &ctx.accounts.mpl_program.to_account_info();
    let collection = &ctx.accounts.collection.to_account_info();
    let collection_key = collection.key();
    let nft_ata = &ctx.accounts.nft_user_token_account.to_account_info();
    let nft_record = &ctx.accounts.nft_record.to_account_info();
    let spl_ata_program = &ctx.accounts.spl_ata_program.to_account_info();

    let create_cpi = CreateV1Cpi::new(
        mpl_program,
        CreateV1CpiAccounts {
            metadata: metadata,
            master_edition: Some(master_edition),
            mint: (token_mint, true),
            authority: token_mint,
            payer: payer,
            update_authority: (token_mint, true),
            system_program: system_program,
            sysvar_instructions: sysvar_instructions,
            spl_token_program: Some(token_program),
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
    // When using pda signer:
    let _ = create_cpi.invoke_signed(seeds);

    let portfolio_onchain_data = &mut ctx.accounts.portfolio_data;
    portfolio_onchain_data.token = ctx.accounts.payment_token.key();
    portfolio_onchain_data.amount = amount;
    portfolio_onchain_data.assets = data;
    portfolio_onchain_data.bump = ctx.bumps.portfolio_data;  


    let mint_args = MintV1InstructionArgs {
        amount: 1,
        authorization_data: None
    };


    let mint_cpi = MintV1Cpi::new(
        mpl_program,
        MintV1CpiAccounts {
            token: nft_ata,
            token_owner: Some(payer),
            token_record: Some(nft_record),
            delegate_record: None,
            spl_ata_program: spl_ata_program,
            authorization_rules: None,
            authorization_rules_program: None,
            metadata: metadata,
            master_edition: Some(master_edition),
            mint: token_mint,
            authority: token_mint,
            payer: payer,
            system_program: system_program,
            sysvar_instructions: sysvar_instructions,
            spl_token_program: token_program,
        },
        mint_args,
    );
    msg!("Invoke signed mint");
    let _ = mint_cpi.invoke_signed(seeds);
}
