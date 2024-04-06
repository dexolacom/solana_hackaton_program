use std::borrow::Borrow;

use anchor_lang::prelude::*;
use anchor_spl::{associated_token::AssociatedToken, token::{ Mint, Token, TokenAccount, Transfer, transfer}};
use mpl_token_metadata::{
    accounts::Metadata, instructions::{CreateV1Cpi, CreateV1CpiAccounts, CreateV1InstructionArgs, MintV1Cpi, MintV1CpiAccounts, MintV1InstructionArgs, VerifyCollectionV1Cpi, VerifyCollectionV1CpiAccounts}, types::{Collection, PrintSupply, TokenStandard}
};
use crate::portfolio::PortfolioCollectionData;
use crate::config::BiscuitConfig;
use crate::err::BiscuitError;
use whirlpool_cpi::{self};



#[derive(Accounts)]
#[instruction(_id: u8, portfolio_id: u8)]
pub struct BuyPortfolio<'info> {

    #[account(mut, 
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, BiscuitConfig>,

    #[account(
        mut, 
        constraint = treasury_ata.owner == config.treasury
    )]
    pub treasury_ata: Account<'info, TokenAccount>,

    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut,
    )]
    pub collection: Account<'info, Mint>,

    /// CHECK:
    #[account(mut)]
    pub collection_metadata: UncheckedAccount<'info>,

    /// CHECK:
    #[account(mut)]
    pub collection_master_edition: UncheckedAccount<'info>,

    #[account(mut)]
    pub collection_onchaindata: Account<'info, PortfolioCollectionData>,

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
#[account]
pub struct  PortfolioData{
    token: Pubkey,
    amount: u64,
}

pub fn buy_portfolio<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, BuyPortfolio<'info>>,   
    _id: u8,  
    portfolio_id: u8,
    uri: String,
    amount: u64,
    other_amount_threshold: Vec<u64>,
    sqrt_price_limit: Vec<u128>,
    amount_specified_is_input: Vec<bool>,
    a_to_b: Vec<bool>,
) -> Result<()> {

    // TODO: make min amount check
    // if(amount < )
    let mut collection_metadata = Metadata::from_bytes(&mut &**ctx.accounts.collection_metadata.to_account_info().try_borrow_data()?)?;
    // let details = collection_metadata.collection_details.ok_or(BiscuitError::InvalidCollectionMetadata)?;
    // let detal = collection_metadata.collection_details.take();
    verify_nft_id(collection_metadata, _id as u64);

    let swaps_accs  = ctx.remaining_accounts;
    let portfoilio_length = ctx.accounts.collection_onchaindata.tokens.len();
    
    let collection = &ctx.accounts.collection.to_account_info();
    let collection_key = collection.key();
    let seeds: &[&[&[u8]]] = &[&[
        "token".as_bytes(),
        collection_key.as_ref(),
        &_id.to_le_bytes(),
        &[ctx.bumps.token_mint]
    ]];

    // SEND FEE TO TREASURY
    let fee = ctx.accounts.collection_onchaindata.fee_in;
    let fee_amount = amount * fee as u64/ 1000;
    let cpi_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.payment_token_account.to_account_info(),
            to: ctx.accounts.treasury_ata.to_account_info(),
            authority: ctx.accounts.payer.to_account_info(),
        },
    );
    transfer(cpi_ctx, fee_amount)?;
    let new_amount = amount - fee_amount;

    // SWAP PROCESS
    for i in 0..portfoilio_length {
        let swap_amount = ctx.accounts.collection_onchaindata.percentages[i] as u64 *new_amount / 1000;
        
        let cpi_program = ctx.accounts.whirlpool_program.to_account_info();
        let offset = 8*i;

        if ctx.accounts.payment_token_account.mint == ctx.accounts.collection_onchaindata.tokens[i] {
            let cpi_ctx = CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.payment_token_account.to_account_info(),
                    to: swaps_accs[0 + offset].to_account_info(),
                    authority: ctx.accounts.payer.to_account_info(),
                },
            );
            transfer(cpi_ctx, swap_amount)?;
        }
        else{

        let cpi_accounts = whirlpool_cpi::cpi::accounts::Swap{
            token_program: ctx.accounts.token_program.to_account_info(),
            token_authority: ctx.accounts.payer.to_account_info(),
            token_owner_account_a:  if a_to_b[i] == true  {ctx.accounts.payment_token_account.to_account_info()} else { swaps_accs[0 + offset].to_account_info() },
            token_owner_account_b: if a_to_b[i] != true  {ctx.accounts.payment_token_account.to_account_info()} else { swaps_accs[0 + offset].to_account_info() },
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
          msg!("CPI: whirlpool swap");
          whirlpool_cpi::cpi::swap(
            cpi_ctx,
            swap_amount,
            other_amount_threshold[i],
            sqrt_price_limit[i],
            amount_specified_is_input[i],
            a_to_b[i],
          );
        }
    }

    create_nft(
        ctx, 
        uri,
        _id, 
        portfolio_id,
        amount,
    );

    Ok(())
}

pub fn create_nft(
    ctx: Context<BuyPortfolio>,     
    uri: String,
    _id: u8,
    portfolio_id: u8,
    amount: u64,
) -> () {

    let name = String::from("PortfolioToken") + &_id.to_string();
    let symbol = String::from("PRT");

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
    let metadata = &ctx.accounts.metadata_account.to_account_info();
    let token_mint = &ctx.accounts.token_mint.to_account_info();
    let system_program = &ctx.accounts.system_program.to_account_info();
    let sysvar_instructions = &ctx.accounts.sysvar_instructions.to_account_info();
    let master_edition = &ctx.accounts.master_edition_account.to_account_info();
    let mpl_program = &ctx.accounts.mpl_program.to_account_info();
    let collection = &ctx.accounts.collection.to_account_info();
    let collection_metadata = &ctx.accounts.collection_metadata.to_account_info();
    let collection_master_edition = &ctx.accounts.collection_master_edition.to_account_info();
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
    let bump = ctx.bumps.token_mint;
    let seeds: &[&[&[u8]]] = &[&[
        "token".as_bytes(),
        collection_key.as_ref(),
        &_id.to_le_bytes(),
        &[bump]
    ]];
    msg!("Seed {:?}", seeds);
    msg!("Invoke signed");
    // When using pda signer:
    let _ = create_cpi.invoke_signed(seeds);
    
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
    msg!("Seed {:?}", seeds);
    let _ = mint_cpi.invoke_signed(seeds);

    let verify_seeds: &[&[&[u8]]] = &[
        &[
            "collection".as_bytes(),
            crate::ID.as_ref(),
            &portfolio_id.to_le_bytes(),
            &[ctx.accounts.collection_onchaindata.bump],
        ],
    ];

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

    let _ = verify_cpi.invoke_signed(verify_seeds);
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

pub fn verify_nft_id(collection_metadata: Metadata, id: u64) -> Result<()>  {
    if let Some(ref details) = collection_metadata.collection_details {
        match details {
            #[allow(deprecated)]
            mpl_token_metadata::types::CollectionDetails::V1 { size } => {
                if(size + 1 != id){
                    return Err(BiscuitError::InvalidNFTId.into());
                }
                Ok(())
            }
            mpl_token_metadata::types::CollectionDetails::V2 { padding: _ } => return Err(BiscuitError::InvalidCollectionMetadata.into()),
        }
    } else {
        msg!("No collection details. Can't decrement.");
        return Err(BiscuitError::InvalidCollectionMetadata.into())
    }
}