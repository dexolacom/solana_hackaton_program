

import 'dotenv/config'
import * as anchor from "@coral-xyz/anchor";
import {
  createMint,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Program } from "@coral-xyz/anchor";
import { Biscuit } from "../target/types/biscuit";
import { PublicKey, Transaction } from '@solana/web3.js';
import { getCollectionAddresses } from '../tests/helpers/collection';
// const collection_data = {
//   title: "Solana Ecosystem",
//   symbol: "SLT",
//   uri: "https://ipfs.io/ipfs/QmWb9hihVBZ3Qi7UjwfBxgKmtNwXCVcPTT9RppRkZ9kjuA"
// }
const collection_data = {
  "name": "Classic",
  "symbol": "CLC",
  uri: "https://ipfs.io/ipfs/QmV3FeU8j8FTBbQgqiMhsGqFJt7WcQ5J17N7oJ15yXk1en"
}
const portfolio_id = 3
const fee_in =100;
const fee_out=0;
const portfolio_tokens = [
  [
    {
      key: "7u8NENSnY1k6vH6HERBvJvCjqkpwFHGTnxzmwEAvbMng", // BTC
      percent: 300
    },
    {
      key: "So11111111111111111111111111111111111111112", // SOL
      percent: 200
    },
    {
      key: "4AJv9M5uMrMbyArp9Tio9MR2WovY9r5F8MXdQLRyDHaC", // ETH
      percent: 150
    },
    {
      key: "B9L1ksf9U7fyWJcb6oEUs9NQjar3gYWPTrG23phHdHcm", // JUP
      percent: 100
    },
    {
      key: "7nXViVzM7ehQZ5y5Jg6nBjPkpfcXPUyi2JEo6NiwzgHx", // RNDR
      percent: 100
    },
    {
      key: "Au69YNzR39wDY2MEVFUFakmiEYzmpS7bjJyJdkiatRwJ", // HNT
      percent: 50
    },
    {
      key: "2Koqru6oQmNRWiw9M1JMh3gVboPsfh2s6kh7Cgwz9SBb", // BONK
      percent: 50
    },
    {
      key: "CZPL3GNVuYELeSJYoreN4MhiieDaJX2ooR2wjsnLu9nX", // PYTH
      percent: 50
    }
  ],
  [
    {
      key: "So11111111111111111111111111111111111111112", // SOL
      percent: 300
    },
    {
      key: "B9L1ksf9U7fyWJcb6oEUs9NQjar3gYWPTrG23phHdHcm", // JUP
      percent: 150
    },
    {
      key: "7nXViVzM7ehQZ5y5Jg6nBjPkpfcXPUyi2JEo6NiwzgHx", // RNDR
      percent: 150
    },
    {
      key: "Au69YNzR39wDY2MEVFUFakmiEYzmpS7bjJyJdkiatRwJ", // HNT
      percent: 150
    },
    {
      key: "2Koqru6oQmNRWiw9M1JMh3gVboPsfh2s6kh7Cgwz9SBb", // BONK
      percent: 50
    },
    {
      key: "CZPL3GNVuYELeSJYoreN4MhiieDaJX2ooR2wjsnLu9nX", // PYTH
      percent: 50
    },
    {
      key: "3mqUMjrvHPhJj97Ks7Z1msp1Xb1HAfYDbGsXkbMET7qo", //RAY
      percent: 50
    },
    {
      key: "ArUaz7YBGZ3Z5Ut1VNLLEuYV2P1dM9FWmwxf6XMxTbCy", // JTO
      percent: 50
    },
    {
      key: "4z5zhHoGTV1zmjgSfMJKcFHBvxRY5XMheFopNPm5mszJ", // WIF
      percent: 50
    }
  ],
  [
    {
      key: "7u8NENSnY1k6vH6HERBvJvCjqkpwFHGTnxzmwEAvbMng", // BTC
      percent: 350
    },
    {
      key: "So11111111111111111111111111111111111111112", // SOL
      percent: 250
    },
    {
      key: "4AJv9M5uMrMbyArp9Tio9MR2WovY9r5F8MXdQLRyDHaC", // ETH
      percent: 200
    },
    {
      key: "B9L1ksf9U7fyWJcb6oEUs9NQjar3gYWPTrG23phHdHcm", // JUP
      percent: 200
    },
  ],
  [
    {
      key: "So11111111111111111111111111111111111111112", // SOL
      percent: 350
    },
    {
      key: "B9L1ksf9U7fyWJcb6oEUs9NQjar3gYWPTrG23phHdHcm", // JUP
      percent: 250
    },
    {
      key: "7nXViVzM7ehQZ5y5Jg6nBjPkpfcXPUyi2JEo6NiwzgHx", // RNDR
      percent: 200
    },
    {
      key: "Au69YNzR39wDY2MEVFUFakmiEYzmpS7bjJyJdkiatRwJ", // HNT
      percent: 200
    },
  ]
]

async function run() {

  const provider = anchor.AnchorProvider.env();
  const wallet = provider.wallet as anchor.Wallet;
  const TOKEN_METADATA_PROGRAM_ID = new anchor.web3.PublicKey(
    "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
  );
  const program = anchor.workspace.Biscuit as Program<Biscuit>;
  const config_address = anchor.web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from("config"),
    ],
    program.programId
  )[0];

 
  const portfolio_collection = getCollectionAddresses(portfolio_id);

  const instruction = await program.methods.createPortfolio(
    portfolio_id,
    collection_data.uri,
    portfolio_tokens[portfolio_id-1].map(e => new PublicKey(e.key)),
    Buffer.from(portfolio_tokens[portfolio_id-1].map(e => e.percent)),
    fee_in,
    fee_out
  )
    .accounts({
      config: config_address,
      signer: wallet.publicKey,
      mint: portfolio_collection.collection_mint,
      metadata: portfolio_collection.collection_metadata,
      masterEdition: portfolio_collection.collection_master_edition,
      onchainData: portfolio_collection.collection_onchain_data,
      mplProgram: TOKEN_METADATA_PROGRAM_ID,
      sysvarInstructions: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
    }).signers([wallet.payer]).instruction();

    const tx = new Transaction();
    tx.add(instruction);
    
    const res = await provider.connection.sendTransaction(tx, [wallet.payer])
    console.log(res)
}

run().then(() => console.log('Script successful finished.')).catch(err => console.error(err));