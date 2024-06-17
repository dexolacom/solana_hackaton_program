use anchor_lang::prelude::*;
use anchor_spl::{associated_token::AssociatedToken, token::{ Mint, Token, TokenAccount}};
use crate::{
    err::BiscuitError, state::portfolio::{Portfolio, PortfolioCollection, PORTFOLIO_PERCENT_PRECISION}, ID
};
use whirlpool_cpi;

#[derive(Accounts)]
#[instruction(_id: u8, _portfolio_id: u8)]
pub struct SwapPortfolio<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"collection", ID.as_ref(), &_portfolio_id.to_le_bytes()],
        bump
    )]
    pub collection: Box<Account<'info, Mint>>,

    #[account(mut)]
    pub collection_onchaindata: Box<Account<'info, PortfolioCollection>>,

    // The PDA is both the address of the mint account and the mint authority
    #[account(
        mut,
        seeds = [b"token", collection.key().as_ref(), &_id.to_le_bytes()],
        bump,
    )]
    pub mint: Box<Account<'info, Mint>>,

    #[account(mut,
        seeds = [b"onchain-data", mint.key().as_ref()],
        bump,
    )]
    pub portfolio_data: Box<Account<'info, Portfolio>>,

    #[account(
        mut, 
        constraint = portfolio_payment_account.owner == mint.key(),
        constraint = portfolio_payment_account.mint == payment_token.key()
    )]
    pub portfolio_payment_account: Account<'info, TokenAccount>,

    #[account(mut,
        address = portfolio_data.payment_token
    )]
    pub payment_token: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
    pub spl_ata_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    
    /// CHECK: checked in CPI
    pub sysvar_instructions: UncheckedAccount<'info>,
    pub rent: Sysvar<'info, Rent>,
    pub whirlpool_program: Program<'info, whirlpool_cpi::program::Whirlpool>,

    // Remaining accounts:
    // 0 - receiver token account (potrfolio target token account)
    // 1 - token vault a
    // 2 - token vault b
    // 3 - tick array 0
    // 4 - tick array 1
    // 5 - tick array 2
    // 6 - oracle
    // 7 - whirlpool
}

pub fn swap_portfolio<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, SwapPortfolio<'info>>,   
    _id: u8,  
    _portfolio_id: u8,
    other_amount_threshold: Vec<u64>,
    sqrt_price_limit: Vec<u128>,
    amount_specified_is_input: Vec<bool>,
    a_to_b: Vec<bool>,
) -> Result<()> {

    if ctx.accounts.payer.key() != ctx.accounts.portfolio_data.buyer{
        return Err(BiscuitError::InvalidPermissions.into());
    }

    let portfoilio_length = ctx.accounts.collection_onchaindata.tokens.len();
    let swap_index = ctx.accounts.portfolio_data.swap_index as usize;
    let amount = ctx.accounts.portfolio_data.payment_amount;

    let collection_key = ctx.accounts.collection.key().as_ref().to_vec();
    let seeds: &[&[&[u8]]] = &[&[
        "token".as_bytes(),
        &collection_key,
        &_id.to_le_bytes(),
        &[ctx.bumps.mint]
    ]];
    let input_swaps_length = ctx.remaining_accounts.len() / 8 ;

    if swap_index + input_swaps_length > portfoilio_length {
        return Err(BiscuitError::InvalidSwapIndex.into());
    }
    msg!("Biscuit: (debug). Swap index: {}. Portfolio length: {}. Input swaps count: {}. ", swap_index, portfoilio_length, input_swaps_length);

    // SWAP PROCESS
    for i in 0..input_swaps_length {

        let swap_amount = ctx.accounts.collection_onchaindata.percentages[swap_index + i] as u64 * amount / PORTFOLIO_PERCENT_PRECISION;
        let cpi_program = ctx.accounts.whirlpool_program.to_account_info();
        let offset = 8 * i;

        let expected_token = ctx.accounts.collection_onchaindata.tokens[i + swap_index];

        let target_token_account = Account::<TokenAccount>::try_from(&ctx.remaining_accounts[0 + offset])?;
        msg!("Biscuit: (debug). Expected token: {}. Swap amount: {}. Percentage: {}", target_token_account.mint, swap_amount, ctx.accounts.collection_onchaindata.percentages[swap_index + i]);
        
        if expected_token != target_token_account.mint {
            msg!("Expected token {} but got {}", expected_token.key(), target_token_account.mint);
            return Err(BiscuitError::InvalidPoolForSwap.into());
        }
        
        if expected_token != ctx.accounts.portfolio_data.payment_token  {
            let cpi_accounts = whirlpool_cpi::cpi::accounts::Swap{
                token_program: ctx.accounts.token_program.to_account_info(),
                token_authority: ctx.accounts.mint.to_account_info(),
                token_owner_account_a:  if a_to_b[i] == true  {ctx.accounts.portfolio_payment_account.to_account_info()} else { ctx.remaining_accounts[0 + offset].to_account_info() },
                token_owner_account_b: if a_to_b[i] != true  {ctx.accounts.portfolio_payment_account.to_account_info()} else { ctx.remaining_accounts[0 + offset].to_account_info() },
                token_vault_a: ctx.remaining_accounts[1+offset].to_account_info(), //lookup
                token_vault_b: ctx.remaining_accounts[2+offset].to_account_info(), //lookup
                tick_array_0: ctx.remaining_accounts[3+offset].to_account_info(),//lookup
                tick_array_1: ctx.remaining_accounts[4+offset].to_account_info(), //lookup
                tick_array_2: ctx.remaining_accounts[5+offset].to_account_info(), //lookup
                oracle: ctx.remaining_accounts[6+offset].to_account_info(), // lookup 
                whirlpool: ctx.remaining_accounts[7+offset].to_account_info(), //lookup
              };
    
              let cpi_ctx = CpiContext::new_with_signer(
                cpi_program,
                cpi_accounts,
                seeds
            );
            
              msg!("Biscuit: Whirlpool swap");
              let _ = whirlpool_cpi::cpi::swap(
                cpi_ctx,
                swap_amount,
                other_amount_threshold[i],
                sqrt_price_limit[i],
                amount_specified_is_input[i],
                a_to_b[i],
              );
        }else{
            msg!("Biscuit: Payment token in swap. Skipping.")
        }
    }

    let portfolio_data = &mut ctx.accounts.portfolio_data;
    portfolio_data.swap_index = (swap_index as u8) + (input_swaps_length as u8);

    Ok(())
}

pub fn invert_swap_portfolio<'c: 'info, 'info>(
    ctx: Context<'_, '_, 'c, 'info, SwapPortfolio<'info>>,   
    _id: u8,  
    _portfolio_id: u8,
    other_amount_threshold: Vec<u64>,
    sqrt_price_limit: Vec<u128>,
    amount_specified_is_input: Vec<bool>,
    a_to_b: Vec<bool>,
) -> Result<()> {
    if ctx.accounts.payer.key() != ctx.accounts.portfolio_data.burn_params.seller {
        return Err(BiscuitError::InvalidPermissions.into());
    }

    let portfoilio_length = ctx.accounts.collection_onchaindata.tokens.len();
    let swap_index = ctx.accounts.portfolio_data.burn_params.swap_index as usize;

    let collection_key = ctx.accounts.collection.key().as_ref().to_vec();
    
    let seeds: &[&[&[u8]]] = &[&[
        "token".as_bytes(),
        &collection_key,
        &_id.to_le_bytes(),
        &[ctx.bumps.mint]
    ]];

    let input_swaps_length = ctx.remaining_accounts.len() / 8 ;
    msg!("Biscuit: (debug). Swap index: {}. Portfolio length: {}. Input swaps count: {}. ", swap_index, portfoilio_length, input_swaps_length);

    if swap_index + input_swaps_length > portfoilio_length {
        return Err(BiscuitError::InvalidSwapIndex.into());
    }

    // SWAP PROCESS
    for i in 0..input_swaps_length {
        let cpi_program = ctx.accounts.whirlpool_program.to_account_info();
        let offset = 8 * i;
        let expected_token = ctx.accounts.collection_onchaindata.tokens[i + swap_index];
        let target_token_account = Account::<TokenAccount>::try_from(&ctx.remaining_accounts[0 + offset])?;
        if expected_token != target_token_account.mint{
            msg!("Expected token {} but got {}", expected_token.key(), target_token_account.mint);
            return Err(BiscuitError::InvalidPoolForSwap.into());
        }

        if target_token_account.owner != ctx.accounts.mint.key() {
            return Err(BiscuitError::InvalidATAOwner.into());
        }

        let swap_amount = target_token_account.amount;
        msg!("Biscuit: (debug). Expected token: {}. Swap amount: {}.", target_token_account.mint, swap_amount);
        if expected_token != ctx.accounts.portfolio_data.burn_params.burn_payment_token {
            let cpi_accounts = whirlpool_cpi::cpi::accounts::Swap{
                token_program: ctx.accounts.token_program.to_account_info(),
                token_authority: ctx.accounts.mint.to_account_info(),
                token_owner_account_a:  if a_to_b[i] != true  {ctx.accounts.portfolio_payment_account.to_account_info()} else { ctx.remaining_accounts[0 + offset].to_account_info() },
                token_owner_account_b: if a_to_b[i] == true  {ctx.accounts.portfolio_payment_account.to_account_info()} else { ctx.remaining_accounts[0 + offset].to_account_info() },
                token_vault_a: ctx.remaining_accounts[1+offset].to_account_info(), //lookup
                token_vault_b: ctx.remaining_accounts[2+offset].to_account_info(), //lookup
                tick_array_0: ctx.remaining_accounts[3+offset].to_account_info(),//lookup
                tick_array_1: ctx.remaining_accounts[4+offset].to_account_info(), //lookup
                tick_array_2: ctx.remaining_accounts[5+offset].to_account_info(), //lookup
                oracle: ctx.remaining_accounts[6+offset].to_account_info(), // lookup 
                whirlpool: ctx.remaining_accounts[7+offset].to_account_info(), //lookup
              };
    
              let cpi_ctx = CpiContext::new_with_signer(
                cpi_program,
                cpi_accounts,
                seeds
            );
            
              msg!("Biscuit: Whirlpool swap");
              let _ = whirlpool_cpi::cpi::swap(
                cpi_ctx,
                swap_amount,
                other_amount_threshold[i],
                sqrt_price_limit[i],
                amount_specified_is_input[i],
                a_to_b[i],
              );
        }

    }

    let portfolio_data = &mut ctx.accounts.portfolio_data;
    portfolio_data.burn_params.swap_index = (swap_index as u8) + (input_swaps_length as u8);

    Ok(())
}

