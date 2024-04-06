
use anchor_lang::prelude::*;

#[account]
pub struct  BiscuitConfig{
    pub admin_authority: Pubkey,
    pub min_amount: u64,
    pub treasury: Pubkey,
}


#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init,
        seeds = [
            b"config",
        ],
        bump,
        space = 80, 
        payer = payer,
    )]
    pub config: Account<'info, BiscuitConfig>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handle(ctx: Context<Initialize>,
    min_amount: u64, 
    treasury: Pubkey
) -> Result<()> {

    let  config = &mut ctx.accounts.config;
    config.admin_authority = ctx.accounts.payer.key();
    config.min_amount = min_amount;
    config.treasury = treasury;
    Ok(())
}