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
}