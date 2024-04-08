import * as anchor from "@coral-xyz/anchor";

const TOKEN_METADATA_PROGRAM_ID = new anchor.web3.PublicKey(
    "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);

const BISCUIT_PROGRAM_ID = new anchor.web3.PublicKey(
    "BxcGdnbRBXvxPcjSW2f7Gtc9iqPdGNZbf9Z5RqyXxpWM"
)

export function getCollectionAddresses(portfolio_id: number) {
    const collection_mint = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("collection"),
        BISCUIT_PROGRAM_ID.toBuffer(),
        Buffer.from([portfolio_id])
      ],
      BISCUIT_PROGRAM_ID
    )[0]

    const collection_metadata = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("metadata"),
        TOKEN_METADATA_PROGRAM_ID.toBuffer(),
        collection_mint.toBuffer(),
      ],
      TOKEN_METADATA_PROGRAM_ID
    )[0]

    const collection_master_edition = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("metadata"),
        TOKEN_METADATA_PROGRAM_ID.toBuffer(),
        collection_mint.toBuffer(),
        Buffer.from("edition")
      ],
      TOKEN_METADATA_PROGRAM_ID
    )[0]

    const collection_onchain_data = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("onchain-data"),
        collection_mint.toBuffer(),
      ],
      BISCUIT_PROGRAM_ID
    )[0]

    return {
      collection_mint,
      collection_metadata,
      collection_master_edition,
      collection_onchain_data
    }
}