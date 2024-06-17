import { PublicKey, Connection } from "@solana/web3.js";
import { ORCA_WHIRLPOOLS_CONFIG } from "./constants";
import { getAssociatedTokenAddressSync } from "../node_modules/@solana/spl-token";
import { PDAUtil, PoolUtil, PriceMath, SwapUtils, ORCA_WHIRLPOOL_PROGRAM_ID, ParsableWhirlpool } from "@orca-so/whirlpools-sdk";
import BN from "bn.js";

export async function getWhirlpoolInfo(connection: Connection, pool: PublicKey){
  const account = await connection.getAccountInfo(pool);
  if(!account) {
    throw new Error(`Whirlpool ${pool} not found`);
  }

  return ParsableWhirlpool.parse(pool, account);
}

export async function getSwapPortfolioData(
  connection: Connection,
  portfolio: PublicKey,
  amount: BN,
  payment_token: {key: PublicKey, decimals: number},
  tokens: { key: PublicKey, percent: number, decimals: number }[],
){
  const result = {
    args: {
      other_amount_threshold: [],
      sqrt_price_limit: [],
      amount_specified_is_input: [],
      a_to_b: [],
    },
    accounts: [],
    prices: []
  }

  for (const token of tokens) {
    const [_tokenA, _tokenB] = PoolUtil.orderMints(payment_token.key, token.key);
    const [tokenA, tokenB] = _tokenA === payment_token.key ? [payment_token, token] : [token, payment_token];
    if(tokenA.key.equals(tokenB.key)) {
      // PAYMENT TOKEN IN PORTFOLIO CASE
      for (let i = 0; i < 8; i++) {
        result.accounts.push({ pubkey: tokenA.key, isSigner: false, isWritable: false });
        
      }
      result.args.other_amount_threshold.push(new BN(0));
      result.args.sqrt_price_limit.push(new BN(0));
      result.args.amount_specified_is_input.push(true);
      result.args.a_to_b.push(true);
    }
    
    const swap_amount = amount.mul(new BN(token.percent)).div(new BN(1000));
    let a_to_b = tokenA.key.equals(payment_token.key)? true : false;

    const data = await getSwapData(
      connection,
      tokenA.key,
      tokenB.key,
      tokenA.decimals,
      tokenB.decimals,
      swap_amount,
      a_to_b
    )

    const ata = getAssociatedTokenAddressSync(
      token.key,
      portfolio,
      true
    );

    result.accounts.push({ pubkey: ata, isSigner: false, isWritable: true });
    result.accounts.push({ pubkey: data.accounts.tokenVaultA, isSigner: false, isWritable: true });
    result.accounts.push({ pubkey: data.accounts.tokenVaultB, isSigner: false, isWritable: true });
    result.accounts.push({ pubkey: data.accounts.tickArray0, isSigner: false, isWritable: true });
    result.accounts.push({ pubkey: data.accounts.tickArray1, isSigner: false, isWritable: true });
    result.accounts.push({ pubkey: data.accounts.tickArray2, isSigner: false, isWritable: true });
    result.accounts.push({ pubkey: data.accounts.oracle, isSigner: false, isWritable: true });
    result.accounts.push({ pubkey: data.accounts.whirlpool, isSigner: false, isWritable: true });

    result.args.other_amount_threshold.push(data.args.other_amount_threshold);
    result.args.sqrt_price_limit.push(data.args.sqrt_price_limit);
    result.args.amount_specified_is_input.push(data.args.amount_specified_is_input);
    result.args.a_to_b.push(data.args.a_to_b);
  }

  return result;
}

export async function getInvertSwapPortfolioData(
  connection: Connection,
  portfolio: PublicKey,
  payment_token: {key: PublicKey, decimals: number},
  tokens: { key: PublicKey, percent: number, decimals: number, amount: BN }[],
){
  const result = {
    args: {
      other_amount_threshold: [],
      sqrt_price_limit: [],
      amount_specified_is_input: [],
      a_to_b: [],
    },
    accounts: [],
    prices: []
  }

  for (const token of tokens) {
    const [_tokenA, _tokenB] = PoolUtil.orderMints(payment_token.key, token.key);
    const [tokenA, tokenB] = _tokenA === payment_token.key ? [payment_token, token] : [token, payment_token];
    if(tokenA.key.equals(tokenB.key)) {
      // PAYMENT TOKEN IN PORTFOLIO CASE
      for (let i = 0; i < 8; i++) {
        result.accounts.push({ pubkey: tokenA.key, isSigner: false, isWritable: false });
        
      }
      result.args.other_amount_threshold.push(new BN(0));
      result.args.sqrt_price_limit.push(new BN(0));
      result.args.amount_specified_is_input.push(true);
      result.args.a_to_b.push(true);
    }
    
    const swap_amount = token.amount;
    // const swap_amount =  token.amount.mul(new BN(token.percent)).div(new BN(1000));
    let a_to_b = tokenA.key.equals(payment_token.key)? false : true;

    const data = await getSwapData(
      connection,
      tokenA.key,
      tokenB.key,
      tokenA.decimals,
      tokenB.decimals,
      swap_amount,
      a_to_b
    )

    const ata = getAssociatedTokenAddressSync(
      token.key,
      portfolio,
      true
    );

    result.accounts.push({ pubkey: ata, isSigner: false, isWritable: true });
    result.accounts.push({ pubkey: data.accounts.tokenVaultA, isSigner: false, isWritable: true });
    result.accounts.push({ pubkey: data.accounts.tokenVaultB, isSigner: false, isWritable: true });
    result.accounts.push({ pubkey: data.accounts.tickArray0, isSigner: false, isWritable: true });
    result.accounts.push({ pubkey: data.accounts.tickArray1, isSigner: false, isWritable: true });
    result.accounts.push({ pubkey: data.accounts.tickArray2, isSigner: false, isWritable: true });
    result.accounts.push({ pubkey: data.accounts.oracle, isSigner: false, isWritable: true });
    result.accounts.push({ pubkey: data.accounts.whirlpool, isSigner: false, isWritable: true });

    result.args.other_amount_threshold.push(data.args.other_amount_threshold);
    result.args.sqrt_price_limit.push(data.args.sqrt_price_limit);
    result.args.amount_specified_is_input.push(data.args.amount_specified_is_input);
    result.args.a_to_b.push(data.args.a_to_b);
  }

  return result;
}

export async function getSwapData(
  connection: Connection,
  token_a: PublicKey,
  token_b: PublicKey,
  token_a_decimals: number,
  token_b_decimals: number,
  amount: BN,
  a_to_b: boolean
) {
  if(PoolUtil.compareMints(token_a, token_b) > 0) {
    throw new Error('Invalid token order');
  }
  console.log(`Token A: ${token_a.toBase58()}. Token B: ${token_b.toBase58()}. Amount: ${amount.toString()}. A to B: ${a_to_b}.`);

  const whirlpool_pubkey = PDAUtil.getWhirlpool(ORCA_WHIRLPOOL_PROGRAM_ID, ORCA_WHIRLPOOLS_CONFIG, token_a, token_b, 128).publicKey;
  const whirlpool = await getWhirlpoolInfo(connection, whirlpool_pubkey);
  const whirlpool_oracle_pubkey = PDAUtil.getOracle(ORCA_WHIRLPOOL_PROGRAM_ID, whirlpool_pubkey).publicKey;
  const price = PriceMath.sqrtPriceX64ToPrice(whirlpool.sqrtPrice, token_a_decimals, token_b_decimals).toString();
 
  if (!whirlpool) {
    throw new Error('Whirlpool not found');
  }

  const other_amount_threshold = new BN(0);
  const amount_specified_is_input = true;
  const sqrt_price_limit = SwapUtils.getDefaultSqrtPriceLimit(a_to_b);

  const tickarrays = SwapUtils.getTickArrayPublicKeys(
    whirlpool.tickCurrentIndex,
    whirlpool.tickSpacing,
    a_to_b,
    ORCA_WHIRLPOOL_PROGRAM_ID,
    whirlpool_pubkey
  );

  const args = {
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

  return { args, accounts, price};
}