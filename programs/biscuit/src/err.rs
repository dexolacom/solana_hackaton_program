//! Error types
use anchor_lang::prelude::*;

#[error_code]
pub enum BiscuitError {
    #[msg("Portfolio data length is missmatch")]
    DataLengthMissmatch,
    #[msg("Invalid token account for swap")]
    InvalidPoolForSwap,
    #[msg("Invalid collection metadata")]
    InvalidCollectionMetadata,
    #[msg("Invalid NFT id")]
    InvalidNFTId,
    #[msg("Invalid swap index")]
    InvalidSwapIndex,
    #[msg("Portfolio not completed")]
    PortfolioNotCompleted,
    #[msg("Portfolio already received")]
    PortfolioAlreadyReceived,
    #[msg("Invalid state")]
    InvalidState,
    #[msg("Invalid NFT Token Account")]
    InvalidNFTTokenAccount,
    #[msg("Invalid User Token Account")]
    InvalidUserTokenAccount,
    #[msg("Invalid ATA owner")]
    InvalidATAOwner,
    #[msg("Invalid Treasury Token Account")]
    InvalidTreasuryTokenAccount,
    #[msg("Invalid permissions")]
    InvalidPermissions,
    #[msg("Invalid remaining account length")]
    InvalidRemainingAccountLength
}