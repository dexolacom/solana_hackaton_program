

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

const pool_name = 'sol_wbtc'
const path = "/dumps/pools"
const tick_spacing = 1;
const whirlpool_pubkey = new anchor.web3.PublicKey('CjZhHQnNUWdMtHzpJuxrPsK2hydeqKRyiMuzLQ3BMDkK');



async function run() {
    const provider = anchor.AnchorProvider.env()
    console.log(provider.connection.rpcEndpoint);
    const whirlpool_ctx = WhirlpoolContext.withProvider(provider, ORCA_WHIRLPOOL_PROGRAM_ID);
    const fetcher = whirlpool_ctx.fetcher;


    async function writeAccount(name: string, acc: PublicKey) {
        const sub = path + '/' + pool_name + '/' + name ;
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

    const whirlpool = await fetcher.getPool(whirlpool_pubkey);
    if (!whirlpool) {
        throw new Error('Invalid pool');
    }
    await writeAccount('pool.json', whirlpool_pubkey);

    const other_amount_threshold = new anchor.BN(0);
    const amount_specified_is_input = true;
    let a_to_b = true
    let sqrt_price_limit = SwapUtils.getDefaultSqrtPriceLimit(a_to_b);

    await writeAccount('vault_a.json', whirlpool.tokenVaultA);
    await writeAccount('vault_b.json', whirlpool.tokenVaultB);

    const tickarrays_a = SwapUtils.getTickArrayPublicKeys(
            whirlpool.tickCurrentIndex,
            whirlpool.tickSpacing,
            true,
            ORCA_WHIRLPOOL_PROGRAM_ID,
            whirlpool_pubkey
        );

    a_to_b = false
    sqrt_price_limit = SwapUtils.getDefaultSqrtPriceLimit(a_to_b);
    const tickarrays_b = SwapUtils.getTickArrayPublicKeys(
        whirlpool.tickCurrentIndex,
        whirlpool.tickSpacing,
        false,
        ORCA_WHIRLPOOL_PROGRAM_ID,
        whirlpool_pubkey
    );

    let i = 0;
    for (const tick of tickarrays_a) {
        await writeAccount(`tick_${i++}.json`, tick)
    }

    for (const tick of tickarrays_b) {

        await writeAccount(`tick_${i++}.json`, tick)
    }


}

run()
