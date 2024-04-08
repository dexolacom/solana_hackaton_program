

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
const collection_data = {
    title: "Classic",
    symbol: "CLC",
    uri: "https://ipfs.io/ipfs/QmV3FeU8j8FTBbQgqiMhsGqFJt7WcQ5J17N7oJ15yXk1en"
}
import {
    ORCA_WHIRLPOOL_PROGRAM_ID, ORCA_WHIRLPOOLS_CONFIG,
    PDAUtil, SwapUtils,
    WhirlpoolContext, buildWhirlpoolClient, TickUtil, PriceMath, swapQuoteByInputToken,
    toTx,
    TickArrayUtil,
    PoolUtil,
    increaseLiquidityQuoteByInputTokenUsingPriceSlippage,
} from "@orca-so/whirlpools-sdk"
import { getAssociatedTokenAddressSync, ASSOCIATED_TOKEN_PROGRAM_ID, createAssociatedTokenAccountInstruction } from '@solana/spl-token';
const USDC = new PublicKey("BhKhpfHuHvcLtteqDidKrzAtCbjDMSu6P2PDF7vFCsSe");

const portfolio_id = 3;
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

const delay = (delayInms) => {
    return new Promise(resolve => setTimeout(resolve, delayInms));
};
const WHIRLPOOLS = {
    ['BhKhpfHuHvcLtteqDidKrzAtCbjDMSu6P2PDF7vFCsSe']: { // USDC
        "4AJv9M5uMrMbyArp9Tio9MR2WovY9r5F8MXdQLRyDHaC": {
            key: new PublicKey("Axjcsj6x8USndCEfXXQTRsJqJeuQGgipENGgEVmHtrPD"),
            invert: true
        }, // 8 dec ETH
        "7u8NENSnY1k6vH6HERBvJvCjqkpwFHGTnxzmwEAvbMng": {
            key: new PublicKey("BUuunRGciN47Vg83mfbY7KVCbY2CJKMiUVqNTRfzL6sK"),
            invert: true
        }, // 8 dec BTC
        "So11111111111111111111111111111111111111112": {
            key: new PublicKey("HbeqPBsAn57EUs9BJar8KorKG7VreBZrKM4QnhYEuFM9"),
            invert: true
        }, // 9 dec SOL
        "B9L1ksf9U7fyWJcb6oEUs9NQjar3gYWPTrG23phHdHcm": {
            key: new PublicKey("9VLZPnjeT2dtDYRFeA3SuypRAXxyrgzfqV32Fk1HXR8a"),
            invert: true
        }, // 6 dec JUP
        "7nXViVzM7ehQZ5y5Jg6nBjPkpfcXPUyi2JEo6NiwzgHx": {
            key: new PublicKey("94U4aoAsXHqKGt2D4Subhf78sHWfQoqBWRtKZmnFWYJA"),
            invert: true
        }, // 8 dec RNDR
        "Au69YNzR39wDY2MEVFUFakmiEYzmpS7bjJyJdkiatRwJ": {
            key: new PublicKey("DWY43nRas6vu3kiFFUEDwFFLxFZMPG3oBTKBhSBYRwZ2"),
            invert: true
        }, // 8 dec HNT
        "2Koqru6oQmNRWiw9M1JMh3gVboPsfh2s6kh7Cgwz9SBb": {
            key: new PublicKey("854TfhZiF8kE8SzPqnW9eNmi4KsohxoKpKfTfpVejGqK"),
            invert: true
        }, // 5 dec BONK
        "CZPL3GNVuYELeSJYoreN4MhiieDaJX2ooR2wjsnLu9nX": {
            key: new PublicKey("SQaa3NMcuVuSyFzw6T8oWPUGNPGMMwCc2udvVycwMnM"),
            invert: false
        }, // 6 dec PYTH
        "3mqUMjrvHPhJj97Ks7Z1msp1Xb1HAfYDbGsXkbMET7qo": {
            key: new PublicKey("E2RyGjCYDycw9sQV3Kgv5VTLaLbHQdauj48C2s9px9n1"),
            invert: true
        }, // 6 dec RAY
        "ArUaz7YBGZ3Z5Ut1VNLLEuYV2P1dM9FWmwxf6XMxTbCy": {
            key: new PublicKey("35CL1SSYW3gNey4ptMAURa6MChE7ykvwKsyLQ6avAotJ"),
            invert: true
        }, // 9 dec JTO
        "4z5zhHoGTV1zmjgSfMJKcFHBvxRY5XMheFopNPm5mszJ": {
            key: new PublicKey("EF2F1VRfMe2FzKwfHYbEhA4qqLdLwdCkQSXRvH5vhLPt"),
            invert: true
        }, // 6 dec WIF    
    },
}

async function run() {

    const provider = anchor.AnchorProvider.env();
    const wallet = provider.wallet as anchor.Wallet;
    const TOKEN_METADATA_PROGRAM_ID = new anchor.web3.PublicKey(
        "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
    );
    const program = anchor.workspace.Biscuit as Program<Biscuit>;

    const portfolio_collection = getCollectionAddresses(portfolio_id);

    const whirlpool_ctx = WhirlpoolContext.withProvider(provider, ORCA_WHIRLPOOL_PROGRAM_ID);
    const fetcher = whirlpool_ctx.fetcher;

    async function getWhirlpool(whirlpool_pubkey: PublicKey, token_a: PublicKey, token_b: PublicKey, amount: anchor.BN, invert: boolean) {
        // const whirlpool_pubkey = PDAUtil.getWhirlpool(ORCA_WHIRLPOOL_PROGRAM_ID, ORCA_WHIRLPOOLS_CONFIG, token_a, token_b, 1).publicKey;
        const whirlpool_oracle_pubkey = PDAUtil.getOracle(ORCA_WHIRLPOOL_PROGRAM_ID, whirlpool_pubkey).publicKey;
        const whirlpool = await fetcher.getPool(whirlpool_pubkey);
        if (!whirlpool) {
            throw new Error('Invalid pool');
        }

        const other_amount_threshold = new anchor.BN(0);
        const amount_specified_is_input = true;
        const a_to_b = !invert;
        const sqrt_price_limit = SwapUtils.getDefaultSqrtPriceLimit(a_to_b);

        const tickarrays = SwapUtils.getTickArrayPublicKeys(
            whirlpool.tickCurrentIndex,
            whirlpool.tickSpacing,
            a_to_b,
            ORCA_WHIRLPOOL_PROGRAM_ID,
            whirlpool_pubkey
        );

        const args = {
            amount: amount,
            other_amount_threshold,
            sqrt_price_limit,
            amount_specified_is_input,
            a_to_b,
        }

        const accounts = {
            whirlpool: whirlpool_pubkey,
            tokenVaultA: whirlpool.tokenVaultA,
            tokenVaultB: whirlpool.tokenVaultB,
            tickArray0: tickarrays[0],
            tickArray1: tickarrays[1],
            tickArray2: tickarrays[2],
            oracle: whirlpool_oracle_pubkey,
        }

        return { args, accounts };
    }

    async function getPortfolioSwapData(
        payer: PublicKey,
        amountIn: anchor.BN,
        paymen_token: PublicKey,
        tokens_data: Array<{ key: PublicKey, percent: number }>,
        nft_mint: PublicKey,
        forTableCreation = false
    ) {
        const result = {
            args: {
                amount: [],
                other_amount_threshold: [],
                sqrt_price_limit: [],
                amount_specified_is_input: [],
                a_to_b: [],
            },
            accounts: new Array(),
            instructionsForAta: new Array(),
            ata: new Array(),
        }

        for (const token of tokens_data) {

            const associatedToken = getAssociatedTokenAddressSync(
                token.key,
                nft_mint,
                true,
                TOKEN_PROGRAM_ID,
                ASSOCIATED_TOKEN_PROGRAM_ID
            );

            result.instructionsForAta.push(
                createAssociatedTokenAccountInstruction(
                    payer,
                    associatedToken,
                    nft_mint,
                    token.key,
                    TOKEN_PROGRAM_ID,
                    ASSOCIATED_TOKEN_PROGRAM_ID
                )
            );

            result.ata.push(associatedToken);

            const amount = amountIn.mul(new anchor.BN(token.percent)).div(new anchor.BN(1000));
            const whirlpool_pubkey = WHIRLPOOLS[paymen_token.toString()][token.key.toString()];
            console.log(whirlpool_pubkey)
            const data = await getWhirlpool(whirlpool_pubkey.key, paymen_token, token.key, amount, whirlpool_pubkey.invert);

            if (!forTableCreation) {
                result.accounts.push(associatedToken);
            }
            result.accounts.push(data.accounts.tokenVaultA);
            result.accounts.push(data.accounts.tokenVaultB);
            result.accounts.push(data.accounts.tickArray0);
            result.accounts.push(data.accounts.tickArray1);
            result.accounts.push(data.accounts.tickArray2);
            result.accounts.push(data.accounts.oracle);
            result.accounts.push(data.accounts.whirlpool);

            for (const key in result.args) {
                if (Object.prototype.hasOwnProperty.call(result.args, key)) {
                    result.args[key].push(data.args[key]);
                }
            }
        }

        return result;
    }

    const wrpool = await getPortfolioSwapData(wallet.publicKey, new anchor.BN(0), USDC, portfolio_tokens[portfolio_id-1].map(e => {
        return {
            key: new PublicKey(e.key),
            percent: e.percent
        }
    }), portfolio_collection.collection_mint, true);
    const slot = await provider.connection.getSlot() - 1;

    const [lookupTableInst, lookupTableAddress] =
        anchor.web3.AddressLookupTableProgram.createLookupTable({
            authority: wallet.publicKey,
            payer: wallet.publicKey,
            recentSlot: slot,
        });
    // console.log(wrpool.accounts.length);

    const accs = [
        portfolio_collection.collection_mint,
        portfolio_collection.collection_metadata,
        portfolio_collection.collection_master_edition,
        portfolio_collection.collection_onchain_data,
        ...wrpool.accounts
    ]

    
    // const tx = new Transaction();
    // tx.add(lookupTableInst);
    // console.log("here")
    // console.log(lookupTableAddress);
    // await provider.connection.sendTransaction(tx, [wallet.payer])
    // console.log("tableCreated")
    // await new Promise(resolve => setTimeout(resolve, 10000));
   
    const size = 20;
    for (let i = 0; i < wrpool.accounts.length; i += size) {
        const sub = accs.slice(i, i + size)
        const extendInstruction = anchor.web3.AddressLookupTableProgram.extendLookupTable({
            payer: wallet.publicKey,
            authority: wallet.publicKey,
            lookupTable:  new PublicKey('GAvAbmJH9ZbsBxqHkQaE7Rtc4a6QHRANc3KhHx416uAN'),
            // lookupTable: lookupTableAddress,
            addresses: [
                ...sub,
            ]
        });

        const tx = new Transaction();
        tx.add(extendInstruction)
        console.log(`From ${i} to ${i + size}`)
        // console.log(lookupTableAddress);
        await provider.connection.sendTransaction(tx, [wallet.payer])
        console.log('Success')
        await delay(5000);
    }
}

run().then(() => console.log('Script successful finished.')).catch(err => console.error(err));