//! Error types
use anchor_lang::prelude::*;

#[error_code]
pub enum BiscuitError {
    #[msg("Portfolio data length is missmatch")]
    DataLengthMissmatch
}