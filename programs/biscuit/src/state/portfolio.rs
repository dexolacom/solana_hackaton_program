use anchor_lang::prelude::*;
use borsh::{BorshSerialize, BorshDeserialize};

pub static PORTFOLIO_PERCENT_PRECISION: u64 = 1000; 

#[derive( Debug, Default, BorshSerialize, BorshDeserialize, Clone)]
pub struct  PortfolioAsset{
    pub token: Pubkey,
    pub amount: u64,
}

#[account]
#[derive(Default)]
pub struct PortfolioCollection {
    pub tokens: Vec<Pubkey>,
    pub percentages: Vec<u16>,
    pub fee_in: u32,
    pub fee_out: u32,
    pub bump: u8,
}

#[derive(Copy, Clone, PartialEq, AnchorSerialize, AnchorDeserialize, Debug)]
pub enum BurnModel {
    Raw,
    Swap,
}

#[derive(Copy, Clone, PartialEq, AnchorSerialize, AnchorDeserialize, Debug, Default)]
pub enum PortfolioState {
    #[default]
    Init,
    Completed,
    Burning
}

#[derive(Clone, AnchorSerialize, AnchorDeserialize, Debug, Default)]
pub struct BurnParameters {
    pub burn_model: Option<BurnModel>,
    pub seller: Pubkey,
    pub burn_payment_token: Pubkey,
    pub swap_index: u8,
}

#[account]
#[derive(Default, Debug)]
pub struct Portfolio{
    pub state: PortfolioState,    
    pub payment_token: Pubkey,
    pub payment_amount: u64,
    pub swap_index: u8,
    pub buyer: Pubkey,
    pub burn_params: BurnParameters,
}

