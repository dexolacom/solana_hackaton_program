import { Keypair, PublicKey } from '@solana/web3.js';

export const TOKENS_DATA = [
    {
      percent: 300,
      decimals: 8,
      price: 67476.24,
      symbol: "BTC"
    },
    {
      percent: 200,
      decimals: 9,
      price: 175.32,
      symbol: "SOL",
    },
    {
      percent: 150,
      decimals: 8,
      price: 3313,
      symbol: "ETH"
    },
    {
      percent: 100,
      decimals: 6,
      price: 1.373,
      symbol: "JUP"
    },
    {
      percent: 100,
      decimals: 8,
      price: 9.08339,
      symbol: "RNDR"
    },
    {
      percent: 50,
      decimals: 8,
      price: 5.6246415,
      symbol: "HNT"
    },
    {
      percent: 50,
      decimals: 5,
      price: 0.00002303,
      symbol: "BONK"
    },
    {
      percent: 50,
      decimals: 6,
      price: 1.23424,
      symbol: "PYTH"
    }
]

export const TOKENS_IN_COLLECTION = 8;

const tokens = new Array(TOKENS_IN_COLLECTION + 1).fill(0).map(e => Keypair.generate())

export const PAYMENT_TOKEN = {
  keyPair: tokens[tokens.length - 1],
  key: tokens[tokens.length - 1].publicKey,
  decimals: 6
}

type Token = {
    percent: number;
    decimals: number;
    price: number;
    symbol: string;
    keyPair: Keypair;
    key: PublicKey;
}

export const PORTFOLIO_TOKENS:  Token[] = [];

console.debug("Payment token: ", PAYMENT_TOKEN.keyPair.publicKey.toBase58())

for (let i = 0; i < TOKENS_IN_COLLECTION; i++) {
  let keyPair = tokens[i];
  console.debug(`Token ${TOKENS_DATA[i].symbol}: `, keyPair.publicKey.toBase58());
  PORTFOLIO_TOKENS.push({
    ...TOKENS_DATA[i],
    keyPair,
    key: keyPair.publicKey,
  })
}
