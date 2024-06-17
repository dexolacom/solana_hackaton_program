use anchor_lang::prelude::*;
use mpl_token_metadata;


#[derive(Clone)]
pub struct MplMetadata;

impl anchor_lang::Id for MplMetadata {
    fn id() -> Pubkey {
        mpl_token_metadata::ID
    }
}