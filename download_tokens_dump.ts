

import 'dotenv/config'
import fs from "fs";
import * as anchor from "@coral-xyz/anchor";
import {
    ORCA_WHIRLPOOL_PROGRAM_ID, ORCA_WHIRLPOOLS_CONFIG,
    PDAUtil, SwapUtils,
    WhirlpoolContext,
} from "@orca-so/whirlpools-sdk";
import { join } from "path"
import { PublicKey } from "@solana/web3.js";


const tokens = [
    {
        symbol: "USDC",
        mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
    }
]



const path = "/dumps"

async function run() {
    const provider = anchor.AnchorProvider.env()
    console.log(provider.connection.rpcEndpoint);
    const whirlpool_ctx = WhirlpoolContext.withProvider(provider, ORCA_WHIRLPOOL_PROGRAM_ID);
    const fetcher = whirlpool_ctx.fetcher;


    async function writeAccount(name: string, acc: PublicKey) {
        const sub = path + '/' + name ;
        const full_path = join(__dirname, sub);
        const acc_data = await provider.connection.getAccountInfo(acc);
        const datab64 = acc_data.data.toString('base64');
        fs.writeFileSync(full_path, JSON.stringify({ account: {...acc_data, data: [datab64, "base64"]}, pubkey: acc.toBase58() }));
        console.log(`
                [[test.validator.account]]
                address = "${acc.toBase58()}"
                filename = "${sub}"\n
            `);
    }

    for (const token of tokens) {
        await writeAccount(`${token.symbol.toLowerCase()}_mint.json`, new anchor.web3.PublicKey(token.mint));
    }

}

run()
