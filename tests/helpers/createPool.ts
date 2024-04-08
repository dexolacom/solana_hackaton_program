
import * as anchor from "@coral-xyz/anchor";
import {
    ORCA_WHIRLPOOL_PROGRAM_ID, ORCA_WHIRLPOOLS_CONFIG,
    PDAUtil, SwapUtils,
    WhirlpoolContext, buildWhirlpoolClient, TickUtil, PriceMath, swapQuoteByInputToken,
    toTx,
    TickArrayUtil,
    PoolUtil,
    increaseLiquidityQuoteByInputTokenUsingPriceSlippage,
    WhirlpoolClient,
} from "@orca-so/whirlpools-sdk";

import Decimal from "decimal.js";
import { MathUtil, PDA, Percentage, TransactionBuilder } from "@orca-so/common-sdk";
import { increaseLiquidityIx, initTickArrayIx, openPositionIx, openPositionWithMetadataIx, swapIx } from "@orca-so/whirlpools-sdk/dist/instructions";
import { token } from "@coral-xyz/anchor/dist/cjs/utils";
import { DecimalUtil } from "@orca-so/whirlpool-sdk";
import { PublicKey } from '@solana/web3.js';

export async function createTestPool(provider: anchor.AnchorProvider, tokenPayment: PublicKey, tokenRec: PublicKey,  decimalPay: number, decimalRec: number, price: number, percent: number,) {
    const wallet = provider.wallet as anchor.Wallet;
    const whirlpool_ctx = WhirlpoolContext.withProvider(provider, ORCA_WHIRLPOOL_PROGRAM_ID);
    const client = buildWhirlpoolClient(whirlpool_ctx)


    const lowerPrice = new Decimal(price - price * percent/100);
    const upperPrice = new Decimal(price + price * percent/100);
    const tokenA = tokenRec;
    const tokenB = tokenPayment;
    const decimalA = decimalRec;
    const decimalB = decimalPay;

    const poolInitInfo = {
        initSqrtPrice: PriceMath.priceToSqrtPriceX64(new Decimal(price), decimalA, decimalB),
        tickSpacing: 128,
        whirlpoolsConfig: ORCA_WHIRLPOOLS_CONFIG,
        tokenMintA: tokenA,
        tokenMintB: tokenB,
    }

    const pool = await createPool(whirlpool_ctx, client, poolInitInfo, wallet.publicKey);
    await new Promise(resolve => setTimeout(resolve, 2000));


    const position = await openPositionWithLiq(whirlpool_ctx, client, pool, wallet.publicKey, lowerPrice, upperPrice, tokenB, new Decimal(50), true);

    await new Promise(resolve => setTimeout(resolve, 2000));

    await initalizeTicksArrays(whirlpool_ctx, client, pool, position, tokenA.toBase58() === tokenPayment.toBase58(), wallet.publicKey);
    await new Promise(resolve => setTimeout(resolve, 2000));

}


async function createPool(ctx: WhirlpoolContext, client: WhirlpoolClient, poolInitInfo: any, signerPub: anchor.web3.PublicKey) {

    const initalTick = TickUtil.getInitializableTickIndex(
        PriceMath.sqrtPriceX64ToTickIndex(poolInitInfo.initSqrtPrice),
        poolInitInfo.tickSpacing
    );

    const { poolKey: actualPubkey, tx } = await client.createPool(
        poolInitInfo.whirlpoolsConfig,
        poolInitInfo.tokenMintA,
        poolInitInfo.tokenMintB,
        poolInitInfo.tickSpacing,
        initalTick,
        ctx.wallet.publicKey
    );

    console.log("Start create pool.")
    const t_create = await tx.buildAndExecute().catch(err => { console.error(err); throw new Error(err) });
    console.log("Pool created. Address: " + actualPubkey.toBase58());
    return actualPubkey;
}


async function openPositionWithLiq(
    ctx: WhirlpoolContext, client: WhirlpoolClient,
    poolAddress: PublicKey, signerPub: anchor.web3.PublicKey,
    lowerPrice: Decimal, upperPrice: Decimal,
    inputTokenMint: PublicKey, tokenAmount: Decimal,
    execute = false
) {
    const pool = await client.getPool(poolAddress);

    // Verify token mint info is correct
    const tokenAInfo = pool.getTokenAInfo();
    const tokenBInfo = pool.getTokenBInfo();

    // Open a position with no tick arrays initialized.

    const poolData = pool.getData();
    const tokenADecimal = tokenAInfo.decimals;
    const tokenBDecimal = tokenBInfo.decimals;

    const tickLower = TickUtil.getInitializableTickIndex(
        PriceMath.priceToTickIndex(lowerPrice, tokenADecimal, tokenBDecimal),
        poolData.tickSpacing
    );
    const tickUpper = TickUtil.getInitializableTickIndex(
        PriceMath.priceToTickIndex(upperPrice, tokenADecimal, tokenBDecimal),
        poolData.tickSpacing
    );
    // console.log(poolData)
    const quote = increaseLiquidityQuoteByInputTokenUsingPriceSlippage(
        inputTokenMint,
        tokenAmount,
        tickLower,
        tickUpper,
        Percentage.fromFraction(1, 100),
        pool
    )

    
    console.log(`LIQUIDITY: ${quote.liquidityAmount.toString()}.`)
    console.log(`QUOTE EST: ${quote.tokenEstA.toString()}  - ${quote.tokenEstB.toString()}.`)
    console.log(`QUOTE MAX: ${quote.tokenMaxA.toString()}  - ${quote.tokenMaxB.toString()}.`)

    // [Action] Open Position (and increase L)
    const { positionMint, tx: openIx } = await pool.openPosition(
        tickLower,
        tickUpper,
        quote,
        signerPub,
        signerPub
    );
    // const indexs = [tickLower, tickUpper]
    // console.log(indexs)
    // let tx: TransactionBuilder = new TransactionBuilder(ctx.connection, ctx.wallet);
    // for (const i of indexs) {
    //     const pda = PDAUtil.getTickArray(ORCA_WHIRLPOOL_PROGRAM_ID, poolAddress, i);
    //     const ta = await ctx.fetcher.getTickArray(pda.publicKey);
    //     // Exit if it exists
    //     if (!!ta) {
    //         console.log("Tick already exists: " + pda.publicKey.toBase58());
    //         continue;
    //     }

    //     tx.addInstruction(
    //         initTickArrayIx(ctx.program, {
    //             startTick: i,
    //             tickArrayPda: pda,
    //             whirlpool: poolAddress,
    //             funder: signerPub
    //         })
    //     )

    // }

    // await tx.buildAndExecute().catch(err => { console.error(err); throw new Error(err) });

    if(execute){
        console.log("Start open position. Position mint: " + positionMint.toBase58());
        await openIx.buildAndExecute().catch(err => { console.error(err); throw new Error(err) });
        console.log("Position succesful created");
    }
    return positionMint;
}

async function initalizeTicksArrays(ctx: WhirlpoolContext, client: WhirlpoolClient, poolAddress: PublicKey, positionMint: PublicKey, aTob: boolean, signerPub: anchor.web3.PublicKey) {
    const pool = await client.getPool(poolAddress);
    const poolData = pool.getData();
    // Verify position exists and numbers fit input parameters
    const lowerPrice = new Decimal(0.002);
    const upperPrice = new Decimal(0.003);
    const tokenAInfo = pool.getTokenAInfo();
    const tokenBInfo = pool.getTokenBInfo();
    const positionAddress = PDAUtil.getPosition(ORCA_WHIRLPOOL_PROGRAM_ID, positionMint).publicKey;

    const position = await client.getPosition(positionAddress, { maxAge: 0 });
    const positionData = position.getData();

    const tickLowerIndex = TickUtil.getInitializableTickIndex(
        PriceMath.priceToTickIndex(lowerPrice, tokenAInfo.decimals, tokenBInfo.decimals),
        poolData.tickSpacing
    );
    const tickUpperIndex = TickUtil.getInitializableTickIndex(
        PriceMath.priceToTickIndex(upperPrice, tokenAInfo.decimals, tokenBInfo.decimals),
        poolData.tickSpacing
    );

    const whirlpoolData = await ctx.fetcher.getPool(poolAddress, { maxAge: 0 });
    if (!whirlpoolData) {
        throw new Error('No pool data')
    }
    // Option 1 - Get the current tick-array PDA based on your desired sequence
    const startTick = TickUtil.getStartTickIndex(whirlpoolData.tickCurrentIndex, whirlpoolData.tickSpacing);
    const tickArrayKey = PDAUtil.getTickArray(ORCA_WHIRLPOOL_PROGRAM_ID, poolAddress, startTick);

    // Option 2 - Get the sequence of tick-arrays to trade in based on your trade direction. 
    const indexs = new Array<number>();

    const shift = aTob ? 0 : whirlpoolData.tickSpacing;
    let offset = 0;
    for (let i = 0; i < 3; i++) {
        let index = TickUtil.getStartTickIndex(whirlpoolData.tickCurrentIndex+shift, whirlpoolData.tickSpacing, offset);
        offset = aTob ? offset - 1 : offset + 1;
        indexs.push(index)
    }

    const tickArrays = await SwapUtils.getTickArrays(
        whirlpoolData.tickCurrentIndex,
        whirlpoolData.tickSpacing,
        aTob,
        ORCA_WHIRLPOOL_PROGRAM_ID,
        poolAddress,
        ctx.fetcher,
    );


    let tx: TransactionBuilder = new TransactionBuilder(ctx.connection, ctx.wallet);

    for (const i of indexs) {
        const pda = PDAUtil.getTickArray(ORCA_WHIRLPOOL_PROGRAM_ID, poolAddress, i);
        const ta = await ctx.fetcher.getTickArray(pda.publicKey);
        // Exit if it exists
        if (!!ta) {
            console.log("Tick already exists: " + pda.publicKey.toBase58());
            continue;
        }
        console.log('Tick array: ' + pda.publicKey);
        tx.addInstruction(
            initTickArrayIx(ctx.program, {
                startTick: i,
                tickArrayPda: pda,
                whirlpool: poolAddress,
                funder: signerPub
            })
        )

    }

    await tx.buildAndExecute().catch(err => { console.error(err); throw new Error(err) });

}
// run();
