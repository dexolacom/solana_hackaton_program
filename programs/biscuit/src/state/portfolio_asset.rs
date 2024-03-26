use anchor_lang::prelude::*;
use borsh::{BorshSerialize, BorshDeserialize};

#[derive( Debug, Default, BorshSerialize, BorshDeserialize, Clone)]
pub struct  PortfolioAsset{
    pub token: Pubkey,
    pub amount: u64,
}
