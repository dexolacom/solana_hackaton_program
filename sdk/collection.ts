import {PublicKey} from "@solana/web3.js";
import {BISCUIT_PROGRAM_ID, TOKEN_METADATA_PROGRAM_ID} from "./constants";
import {Program} from "@project-serum/anchor";
import { Biscuit } from "./artifacts";

export function getPortfolioCollectionAddresses(
  collection_id: number,
  BISCUIT_PROGRAM = BISCUIT_PROGRAM_ID,
  TOKEN_METADATA_PROGRAM = TOKEN_METADATA_PROGRAM_ID
) {
    const collection = PublicKey.findProgramAddressSync(
      [
        Buffer.from("collection"),
        BISCUIT_PROGRAM.toBuffer(),
        Buffer.from([collection_id])
      ],
      BISCUIT_PROGRAM
    )[0]

    const metadata = PublicKey.findProgramAddressSync(
      [
        Buffer.from("metadata"),
        TOKEN_METADATA_PROGRAM.toBuffer(),
        collection.toBuffer(),
      ],
      TOKEN_METADATA_PROGRAM
    )[0]

    const masterEdition = PublicKey.findProgramAddressSync(
      [
        Buffer.from("metadata"),
        TOKEN_METADATA_PROGRAM.toBuffer(),
        collection.toBuffer(),
        Buffer.from("edition")
      ],
      TOKEN_METADATA_PROGRAM
    )[0]

    const collectionOnchaindata = PublicKey.findProgramAddressSync(
      [
        Buffer.from("onchain-data"),
        collection.toBuffer(),
      ],
      BISCUIT_PROGRAM
    )[0]

    return {
        collection,
        metadata,
        masterEdition,
        collectionOnchaindata
    }
}

export async function getPortfolioCollectionData(program: Program<Biscuit>, portfolioCollectionDataAddress: PublicKey) {
  return program.account.portfolioCollection.fetch(portfolioCollectionDataAddress);
}

