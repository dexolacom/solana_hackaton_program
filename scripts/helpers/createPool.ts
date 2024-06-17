
import * as anchor from "@coral-xyz/anchor";
import {
    ORCA_WHIRLPOOL_PROGRAM_ID, ORCA_WHIRLPOOLS_CONFIG,
    PDAUtil, SwapUtils,
    WhirlpoolContext, buildWhirlpoolClient, TickUtil, PriceMath,
    PoolUtil,
    increaseLiquidityQuoteByInputTokenUsingPriceSlippage,
    WhirlpoolClient,
} from "@orca-so/whirlpools-sdk";

import Decimal from "decimal.js";
import { Percentage, TransactionBuilder } from "@orca-so/common-sdk";
import { initTickArrayIx} from "@orca-so/whirlpools-sdk/dist/instructions";
import { PublicKey } from '@solana/web3.js';

export async function createTestPool(
    provider: anchor.AnchorProvider,
    tokenPayment: PublicKey,
    tokenRec: PublicKey,
    decimalPay: number,
    decimalRec: number,
    _price: number,
    percent: number,
    CONFIG = ORCA_WHIRLPOOLS_CONFIG
) {
    const wallet = provider.wallet as anchor.Wallet;
    const whirlpool_ctx = WhirlpoolContext.withProvider(provider, ORCA_WHIRLPOOL_PROGRAM_ID);
    const client = buildWhirlpoolClient(whirlpool_ctx)

    const [tokenA, tokenB] =  PoolUtil.orderMints(tokenPayment, tokenRec);
    const invert = tokenA.toString() === tokenPayment.toString();
    
    console.log("Token A: " + tokenA);
    console.log("Token B: " + tokenB);
    const decimalA = invert ? decimalPay : decimalRec;
    const decimalB = !invert ? decimalPay : decimalRec;

    const price = invert ? PriceMath.invertPrice(new Decimal(_price), decimalA, decimalB) : new Decimal(_price);

    const lowerPrice =  price.minus(price.mul(percent).div(100)) //new Decimal(price - price * percent/100).;
    const upperPrice = price.plus(price.mul(percent).div(100)) //new Decimal(price + price * percent/100);

    const poolInitInfo = {
        initSqrtPrice: PriceMath.priceToSqrtPriceX64(new Decimal(price), decimalA, decimalB),
        tickSpacing: 128,
        whirlpoolsConfig: CONFIG,
        tokenMintA: tokenA,
        tokenMintB: tokenB,
    }

    const pool = await createPool(whirlpool_ctx, client, poolInitInfo, wallet.publicKey);
    // const pool = PDAUtil.getWhirlpool(
    //     ORCA_WHIRLPOOL_PROGRAM_ID,
    //     CONFIG, 
    //     new PublicKey(tokenA),
    //     new PublicKey(tokenB),
    //     128
    // ).publicKey;
    // console.log("Pool: " + pool.toBase58())
    await new Promise(resolve => setTimeout(resolve, 2000));

    const tick1 = await initalizeTicksArrays(whirlpool_ctx, pool, true, wallet.publicKey);
    const tick2 = await initalizeTicksArrays(whirlpool_ctx, pool, false, wallet.publicKey);
   
    await new Promise(resolve => setTimeout(resolve, 2000));

    const position = await openPositionWithLiq(whirlpool_ctx, client, pool, wallet.publicKey, lowerPrice, upperPrice, tokenPayment, new Decimal(10000), true);

    await new Promise(resolve => setTimeout(resolve, 2000));
    return {
        pool,
        position,
        ticks: [...tick1, ...tick2] 
    }
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
 
    if(execute){
        console.log("Start open position. Position mint: " + positionMint.toBase58());
        await openIx.buildAndExecute().catch(err => { console.error(err); throw new Error(err) });
        console.log("Position succesful created");
    }
    return positionMint;
}

async function initalizeTicksArrays(
    ctx: WhirlpoolContext,
    poolAddress: PublicKey,
    aTob: boolean,
    signerPub: anchor.web3.PublicKey
) {
    const whirlpoolData = await ctx.fetcher.getPool(poolAddress, { maxAge: 0 });
    if (!whirlpoolData) {
        throw new Error('No pool data')
    }
    // Option 1 - Get the current tick-array PDA based on your desired sequence
    const startTick = TickUtil.getStartTickIndex(whirlpoolData.tickCurrentIndex, whirlpoolData.tickSpacing);
   
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
    
    const ticks2 = getTickArrayPublicKeys(whirlpoolData.tickCurrentIndex, whirlpoolData.tickSpacing, aTob, ORCA_WHIRLPOOL_PROGRAM_ID, poolAddress);

    let tx: TransactionBuilder = new TransactionBuilder(ctx.connection, ctx.wallet);
    
    for (const i of ticks2) {
        const pda = PDAUtil.getTickArray(ORCA_WHIRLPOOL_PROGRAM_ID, poolAddress, i.startIndex);
        const ta = await ctx.fetcher.getTickArray(i.address);
        // Exit if it exists
        if (!!ta) {
            console.log("Tick already exists: " + i.address.toBase58());
            continue;
        }
        console.log('Tick array: ' + i.address);
        tx.addInstruction(
            initTickArrayIx(ctx.program, {
                startTick: i.startIndex,
                tickArrayPda: pda,
                whirlpool: poolAddress,
                funder: signerPub
            })
        )

    }

    await tx.buildAndExecute().catch(err => { console.error(err); throw new Error(err) });
    return ticks2;
}

function getTickArrayPublicKeys(tickCurrentIndex, tickSpacing, aToB, programId, whirlpoolAddress) {
    const shift = aToB ? 0 : tickSpacing;
    let offset = 0;
    let tickArrayAddresses: {address: PublicKey, startIndex: number}[] = [];
    for (let i = 0; i < 3; i++) {
        let startIndex;
        try {
            startIndex = TickUtil.getStartTickIndex(tickCurrentIndex + shift, tickSpacing, offset);
        }
        catch {
            return tickArrayAddresses;
        }
        const pda = PDAUtil.getTickArray(programId, whirlpoolAddress, startIndex);
        tickArrayAddresses.push({
          address: pda.publicKey,
          startIndex: startIndex
        });
        offset = aToB ? offset - 1 : offset + 1;
    }
    return tickArrayAddresses;
  }