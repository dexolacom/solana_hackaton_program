use anchor_lang::prelude::*;
use instructions::*;


#[account]
#[derive(Default)]
pub struct Portfolio {
    pub tokens: Vec<Pubkey>,
    pub percentages: Vec<u32>,
}

impl Portfolio {
    pub fn initialize(
        &mut self,
        tokens: Vec<Pubkey>,
        percentages: Vec<u32>,
    ) -> Result<()> {

        if tokens.len() != percentages.len(){
            return Err(ErrorCode::InvalidArrayLength.into());
        }

        self.tokens = tokens;
        self.percentages = percentages;

        Ok(())
    }
}
