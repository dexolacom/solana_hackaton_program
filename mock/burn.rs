use anchor_lang::prelude::*;
use borsh::{BorshSerialize, BorshDeserialize};
use anchor_spl::{associated_token::AssociatedToken, token::{ Mint, Token, TokenAccount}};
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

    #[account(mut, close = payer, )]
    pub collection_onchaindata: Account<'info, PortfolioCollectionData>,

    /// CHECK:
    #[account(mut)]
    pub collection_metadata: UncheckedAccount<'info>,

    // The PDA is both the address of the mint account and the mint authority
    #[account(
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

    #[account(
        init,
        payer = payer,
        space = 106, 
        seeds = [b"onchain-data", metadata_account.key().as_ref()],
        bump
    )]
    pub portfolio_data: Account<'info, PortfolioData>, 

    #[account(mut)]
    pub payment_token_account: Account<'info, TokenAccount>,

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

    pub whirlpool_program: Program<'info, whirlpool_cpi::program::Whirlpool>,

}

#[derive(Debug, Default, BorshSerialize, BorshDeserialize)]
pub struct BuyPortfolioCollectionData {
    uri: String,
    amount: u64,
    token: Pubkey
}

#[account]
pub struct  PortfolioData{
    token: Pubkey,
    amount: u64,
}

pub fn burn_portfolio<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, BurnPortfolio<'info>>,   
    _id: u8,  
    uri: String,
    amount: u64,
    other_amount_threshold: Vec<u64>,
    sqrt_price_limit: Vec<u128>,
    amount_specified_is_input: Vec<bool>,
    a_to_b: Vec<bool>,
) -> Result<()> {

    let swaps_accs  = ctx.remaining_accounts;
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
        // TODO: ANOTHER INPUT
        let amount = ctx.accounts.collection_onchaindata.percentages[i] as u64 *amount / 1000;


        let cpi_program = ctx.accounts.whirlpool_program.to_account_info();
        let offset = 8*i;

        let token_a = if a_to_b[i] == true  {ctx.accounts.payment_token_account.to_account_info()} else { swaps_accs[0 + offset].to_account_info() };
        let token_b = if a_to_b[i] != true  {ctx.accounts.payment_token_account.to_account_info()} else { swaps_accs[0 + offset].to_account_info() };
        msg!("{}", swaps_accs[4+offset].key());
        let cpi_accounts = whirlpool_cpi::cpi::accounts::Swap{
            token_program: ctx.accounts.token_program.to_account_info(),
            token_authority: ctx.accounts.payer.to_account_info(),
            token_owner_account_a: token_a,
            token_owner_account_b: token_b,
            token_vault_a: swaps_accs[1+offset].to_account_info(), //lookup
            token_vault_b: swaps_accs[2+offset].to_account_info(), //lookup
            tick_array_0: swaps_accs[3+offset].to_account_info(),//lookup
            tick_array_1: swaps_accs[4+offset].to_account_info(), //lookup
            tick_array_2: swaps_accs[5+offset].to_account_info(), //lookup
            oracle: swaps_accs[6+offset].to_account_info(), // lookup 
            whirlpool: swaps_accs[7+offset].to_account_info(), //lookup
          };

        
          let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        
          // execute CPI
          msg!("CPI: whirlpool swap instruction");
          whirlpool_cpi::cpi::swap(
            cpi_ctx,
            amount,
            other_amount_threshold[i],
            sqrt_price_limit[i],
            amount_specified_is_input[i],
            a_to_b[i],
          );
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
    let collection_data = Collection {
        verified: false,
        key: ctx.accounts.collection.key(),
    };

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
    let nft_record = &ctx.accounts.nft_record.to_account_info();
    let spl_ata_program = &ctx.accounts.spl_ata_program.to_account_info();

    let burn_cpi = BurnV1Cpi::new(
        mpl_program,
        BurnV1CpiAccounts {
            token: nft_ata,
            token_record: Some(nft_record),
            metadata: metadata,
            master_edition: Some(master_edition),
            mint: token_mint,
            authority: token_mint,
            system_program: system_program,
            sysvar_instructions: sysvar_instructions,
            spl_token_program: token_program,
            collection_metadata: Some(collection_metadata),
            edition: None,
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
    let _ = burn_cpi.invoke_signed(seeds);
}


pub fn swap<'info>(
    whirlpool_program: AccountInfo<'info>,
    accounts: Vec<AccountInfo<'info>>,
    amount: u64,
    token: Pubkey,
    other_amount_threshold: u64,
    sqrt_price_limit: u128,
    amount_specified_is_input: bool,
    a_to_b: bool,
) {

    // let cpi_program = ctx.accounts.whirlpool_program.to_account_info();

    let cpi_accounts = whirlpool_cpi::cpi::accounts::Swap {
        whirlpool: accounts[0].to_account_info(),
        token_program: accounts[1].to_account_info(),
        token_authority: accounts[2].to_account_info(),
        token_owner_account_a: accounts[3].to_account_info(),
        token_vault_a: accounts[4].to_account_info(),
        token_owner_account_b: accounts[5].to_account_info(),
        token_vault_b: accounts[6].to_account_info(),
        tick_array_0: accounts[7].to_account_info(),
        tick_array_1: accounts[8].to_account_info(),
        tick_array_2: accounts[9].to_account_info(),
        oracle: accounts[10].to_account_info(),
      };
    
      let cpi_ctx = CpiContext::new(whirlpool_program, cpi_accounts);
    
      // execute CPI
      msg!("CPI: whirlpool swap instruction");
      whirlpool_cpi::cpi::swap(
        cpi_ctx,
        amount,
        other_amount_threshold,
        sqrt_price_limit,
        amount_specified_is_input,
        a_to_b,
      );
    
}

