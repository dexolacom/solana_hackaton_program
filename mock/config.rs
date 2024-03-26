use anchor_lang::prelude::*;

#[account]
pub struct BiscuitConfig {
    pub authority: Pubkey,
    pub portfolios: Vec<Portfolio>   
}

pub struct Portfolio {
    pub tokens: Vec<Pubkey>,
    pub percentages: Vec<u32>,
    pub fee: u64,
    pub is_active: bool,
}


impl BiscuitConfig {

    pub fn initialize(
        &mut self,
        authority: Pubkey,
    ) -> Result<()> {
        self.fee_authority = fee_authority;
        // self.portfolios = new Vec::Vec()
        Ok(())
    }

    pub fn add_portfolio(
        &mut self,
        data: Portfolio,
    ) {
        self.portfolios.push(data);
    }
}

