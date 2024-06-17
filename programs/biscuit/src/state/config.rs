use anchor_lang::prelude::*;

pub static FEE_PRECISION: u64 = 100000;

#[account]
#[derive(Default, Debug)]
pub struct  BiscuitConfig{
    pub admin_authority: Pubkey,
    pub min_amount: u64,
    pub treasury: Pubkey,
}

#[account]
pub struct  BiscuitVault {}
