import * as anchor from "@coral-xyz/anchor";
import {
    getAssociatedTokenAddressSync
} from "@solana/spl-token";

const TOKEN_METADATA_PROGRAM_ID = new anchor.web3.PublicKey(
    "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);

const BISCUIT_PROGRAM_ID = new anchor.web3.PublicKey(
    "7Zrb5JhpFNgP3UYuvoXCV4JbevnwvQYsxDCmrZb7jDed"
)

export function getNftAddresses(collection_mint: anchor.web3.PublicKey, nft_id: number, user_pubkey: anchor.web3.PublicKey) {
    const nft_mint= anchor.web3.PublicKey.findProgramAddressSync(
        [
            Buffer.from("token"),
            collection_mint.toBuffer(),
            Buffer.from([nft_id])
        ],
        BISCUIT_PROGRAM_ID
    )[0]

    const nft_metadata = anchor.web3.PublicKey.findProgramAddressSync(
        [
            Buffer.from("metadata"),
            TOKEN_METADATA_PROGRAM_ID.toBuffer(),
            nft_mint.toBuffer(),
        ],
        TOKEN_METADATA_PROGRAM_ID
    )[0]

    const nft_master_edition = anchor.web3.PublicKey.findProgramAddressSync(
        [
            Buffer.from("metadata"),
            TOKEN_METADATA_PROGRAM_ID.toBuffer(),
            nft_mint.toBuffer(),
            Buffer.from("edition")
        ],
        TOKEN_METADATA_PROGRAM_ID
    )[0]

    const nft_onchain_data = anchor.web3.PublicKey.findProgramAddressSync(
        [
            Buffer.from("onchain-data"),
            nft_metadata.toBuffer(),
        ],
        BISCUIT_PROGRAM_ID
    )[0]

    const nft_ata = getAssociatedTokenAddressSync(
        nft_mint,
        user_pubkey
    )

    const nft_record = anchor.web3.PublicKey.findProgramAddressSync(
        [
            Buffer.from("metadata"),
            TOKEN_METADATA_PROGRAM_ID.toBuffer(),
            nft_mint.toBuffer(),
            Buffer.from("token_record"),
            nft_ata.toBuffer()
        ],
        TOKEN_METADATA_PROGRAM_ID
    )[0]

    return {
        nft_mint,
        nft_metadata,
        nft_master_edition,
        nft_onchain_data,
        nft_ata,
        nft_record
    }
}