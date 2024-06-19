

import 'dotenv/config'
import * as anchor from "@coral-xyz/anchor";
import {
    createMint,
    TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Program } from "@coral-xyz/anchor";
import { Biscuit } from "../target/types/biscuit";
import { PublicKey, Transaction } from '@solana/web3.js';
import { getPortfolioCollectionAddresses } from '../sdk/collection';
import TOKENS from "../assets/tokens.json";

const COLLECTIONS_DATA = [
    {
        title: "Classic",
        symbol: "CLC",
        uri: "https://ipfs.io/ipfs/QmV3FeU8j8FTBbQgqiMhsGqFJt7WcQ5J17N7oJ15yXk1en",
        tokens: [
            {
                symbol: "BTC",
                percent: 300
            },
            {
                symbol: "SOL",
                percent: 200
            },
            {
                symbol: "ETH",
                percent: 150
            },
            {
                symbol: "JUP",
                percent: 100
            },
            {
                symbol: "RNDR",
                percent: 100
            },
            {
                symbol: "HNT",
                percent: 50
            },
            {
                symbol: "BONK",
                percent: 50
            },
            {
                symbol: "PYTH",
                percent: 50
            }
        ]
    },
    {
        title: "Solana Ecosystem",
        symbol: "SLT",
        uri: "https://ipfs.io/ipfs/QmWb9hihVBZ3Qi7UjwfBxgKmtNwXCVcPTT9RppRkZ9kjuA",
        tokens: [
            {
                symbol: "SOL",
                percent: 300
            },
            {
                symbol: "JUP",
                percent: 150
            },
            {
                symbol: "RNDR",
                percent: 150
            },
            {
                symbol: "HNT",
                percent: 150
            },
            {
                symbol: "BONK",
                percent: 50
            },
            {
                symbol: "PYTH",
                percent: 50
            },
            {
                symbol: "RAY",
                percent: 50
            },
            {
                symbol: "JTO",
                percent: 50
            },
            {
                symbol: "WIF",
                percent: 50
            }
        ]
    }
]

const collection_id = 2;
const data_index = 1;
const fee_in = 250;
const fee_out = 500;

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

    const portfolio_collection = getPortfolioCollectionAddresses(collection_id);

    const tokens = COLLECTIONS_DATA[data_index].tokens.map(e => {
        const data = TOKENS.find(t => t.symbol === e.symbol);
        if (!data) throw new Error(`Token ${e.symbol} not found in TOKENS`)
        return {
            key: new PublicKey(data.key),
            percent: e.percent
        }
    });

   // @ts-ignore
    const instruction = await program.methods.createPortfolio(collection_id,
        COLLECTIONS_DATA[data_index].uri,
        tokens.map(e => e.key),
        Uint32Array.from(tokens.map(e => e.percent)),
        fee_in,
        fee_out
    ).accounts({
        payer: wallet.publicKey,
        config: config_address,
        mint: portfolio_collection.collection,
        metadata: portfolio_collection.metadata,
        masterEdition: portfolio_collection.masterEdition,
        onchainData: portfolio_collection.collectionOnchaindata,
        mplProgram: TOKEN_METADATA_PROGRAM_ID,
        sysvarInstructions: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
    })
    .signers([wallet.payer]).instruction();

    const tx = new Transaction();
    tx.add(instruction);

    const res = await provider.sendAndConfirm(tx, [wallet.payer]);
    console.log(res)
}

run().then(() => console.log('Script successful finished.')).catch(err => console.error(err));