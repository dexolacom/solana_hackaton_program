

import 'dotenv/config'
import * as anchor from "@coral-xyz/anchor";
import {
    getAssociatedTokenAddressSync, ASSOCIATED_TOKEN_PROGRAM_ID, createAssociatedTokenAccountInstruction,
    createMint,
    TOKEN_PROGRAM_ID,
} from "../node_modules/@solana/spl-token";
import { Program } from "@coral-xyz/anchor";
import { Biscuit } from "../target/types/biscuit";
import { PublicKey, Transaction } from '@solana/web3.js';
import { getSwapPortfolioData, getInvertSwapPortfolioData, getWhirlpoolInfo } from '../sdk/swap';
import { getPortfolioCollectionAddresses } from '../sdk/collection';
import TOKENS from "../assets/tokens.json";
import POOLS from "../assets/pools.json"
import { PDAUtil } from '@orca-so/whirlpools-sdk';
import { ORCA_WHIRLPOOL_PROGRAM_ID } from '../sdk/constants';
import {createTable} from "../tests/helpers/send";

const collection_ids = [1, 2];

async function run() {

    const provider = anchor.AnchorProvider.env();
    const wallet = provider.wallet as anchor.Wallet;
    const program = anchor.workspace.Biscuit as Program<Biscuit>;

    const collections = collection_ids.map(e => getPortfolioCollectionAddresses(e));

    const PAYMENT_TOKEN = TOKENS.find(e => e.symbol === "USDC");
    if (!PAYMENT_TOKEN) {
        throw new Error("Payment token not found");
    }

    const collections_accs: PublicKey[] = [];
    for (const collection of collections) {
        collections_accs.push(new PublicKey(collection.collection));
        collections_accs.push(new PublicKey(collection.collectionOnchaindata));
        collections_accs.push(new PublicKey(collection.metadata));
        collections_accs.push(new PublicKey(collection.masterEdition));
    }

    const whirlpool_accs: PublicKey[] = [];

    for (const pool of POOLS) {

        const pool_address = new PublicKey(pool.pool);
        const data = await getWhirlpoolInfo(provider.connection, pool_address);
        if (!data) {
            throw new Error(`Pool ${pool.pool} not found`);
        }
        const whirlpool_oracle_pubkey =  PDAUtil.getOracle(ORCA_WHIRLPOOL_PROGRAM_ID, pool_address).publicKey;

        whirlpool_accs.push(pool_address);
        whirlpool_accs.push(data.tokenMintA);
        whirlpool_accs.push(data.tokenMintB);
        whirlpool_accs.push(data.tokenVaultA);
        whirlpool_accs.push(data.tokenVaultB);
        whirlpool_accs.push(whirlpool_oracle_pubkey);

        for (const tick of pool.ticks) {
            whirlpool_accs.push(new PublicKey(tick.address));
        }

    }

    const treasury_portfolio_token_accounts: PublicKey[] = [];
    for (const token of TOKENS) {
        const acc = getAssociatedTokenAddressSync(
            new PublicKey(token.key),
            wallet.publicKey
        );

        treasury_portfolio_token_accounts.push(acc);
    }

    const accs = [
        ...collections_accs,
        ...whirlpool_accs,
        ...TOKENS.map(e => new PublicKey(e.key)),
        ...treasury_portfolio_token_accounts
    ];

    const resultMap = new Map<string, boolean>();
    accs.forEach(e => resultMap.set(e.toBase58(), true));

    const result = Array.from(resultMap.keys()).map(e => new PublicKey(e));

    const portfolio_lookup_table = await createTable(provider, accs, wallet.payer);

    console.log("Lookup table: " +  portfolio_lookup_table.toBase58());
}

run().then(() => console.log('Script successful finished.')).catch(err => console.error(err));