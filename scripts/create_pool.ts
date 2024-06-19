
import 'dotenv/config'
import * as anchor from "@coral-xyz/anchor";
import fs from "fs/promises";
import { createTestPool } from "./helpers/createPool";
import TOKENS from "../assets/tokens.json";
import { PublicKey } from '@solana/web3.js';

const ORCA_WHIRLPOOLS_CONFIG_DEVNET = new PublicKey('FcrweFY1G9HJAHG5inkGB6pKg1HZ6x9UC2WioAfWrGkR');

const tokens_for_pool = [
    // 'BTC',
    'SOL',
    // 'ETH',
    // 'JUP',
    // 'RNDR',
    // 'HNT',
    // 'BONK',
    // 'PYTH',
    // 'RAY',
    // 'JTO',
    // 'WIF'    
]

async function run() {
    const provider = anchor.AnchorProvider.env();
    const wallet = provider.wallet as anchor.Wallet;

    const payment_token = TOKENS.find(t => t.symbol === "USDC");
    if (!payment_token) {
        throw new Error("USDC not found in tokens.json");
    }

    for (const token_symbol of tokens_for_pool) {
        if (token_symbol === "USDC") {
            throw new Error("USDC is not supported in this script");
        }

        const token = TOKENS.find(t => t.symbol === token_symbol);
        if (!token) {
            throw new Error(`Token ${token_symbol} not found in tokens.json`);
        }

        console.log(`Creating pool for USDC-${token_symbol}. USDC: ${payment_token.key}. ${token_symbol}: ${token.key}.`);

        const data = await createTestPool(
            provider,
            new PublicKey(payment_token.key),
            new PublicKey(token.key),
            payment_token?.decimals,
            token.decimals,
            token.price as number,
            10,
            ORCA_WHIRLPOOLS_CONFIG_DEVNET
        )

        await fs.appendFile('pools.json', JSON.stringify(
            {
                pool: data.pool.toBase58(),
                tokens: 'USDC-' + token_symbol,
                price: token.price,
                position: data.position.toBase58(),
                ticks: data.ticks.map((tick) => {
                    return {
                        address: tick.address.toBase58(),
                        startIndex: tick.startIndex,
                    }
                }),
            }
        ) + ',\n'
        )
    }
}

run();