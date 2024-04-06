import 'dotenv/config'
import * as anchor from "@coral-xyz/anchor";
import {
  ORCA_WHIRLPOOL_PROGRAM_ID, ORCA_WHIRLPOOLS_CONFIG,
  PDAUtil, SwapUtils,
  WhirlpoolContext,
} from "@orca-so/whirlpools-sdk"


async function run() {
  const provider = anchor.AnchorProvider.env();
  const wallet = provider.wallet as anchor.Wallet;
  const whirlpool_ctx = WhirlpoolContext.withProvider(provider, ORCA_WHIRLPOOL_PROGRAM_ID);


}


// const program = new web3.PublicKey('whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc')
// const whirlpool = new web3.PublicKey('FcrweFY1G9HJAHG5inkGB6pKg1HZ6x9UC2WioAfWrGkR')
// const token_mint_a = new web3.PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
// const token_mint_b = new web3.PublicKey('So11111111111111111111111111111111111111112');
// const tick_spacing = 1;

// console.log(
//     web3.PublicKey.findProgramAddressSync([
//         Buffer.from("whirlpool"),
//         whirlpool.toBuffer(),
//         token_mint_b.toBuffer(),
//         token_mint_a.toBuffer(),
//         Buffer.from([tick_spacing])
//     ],
//         program
//     )
// )