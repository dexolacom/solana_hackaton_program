import * as anchor from "@coral-xyz/anchor";
import { Signer, PublicKey, AddressLookupTableAccount } from "@solana/web3.js";

export async function createAndSendV0Tx(
  provider: anchor.AnchorProvider,
  txInstructions: anchor.web3.TransactionInstruction[],
  payer: Signer,
  addressLookupTable: PublicKey[] | undefined = undefined
) {
  // Step 1 - Fetch the latest blockhash
  let latestBlockhash = await provider.connection.getLatestBlockhash(
    "confirmed"
  );
  console.log(
    "   ✅ - Fetched latest blockhash. Last Valid Height:",
    latestBlockhash.lastValidBlockHeight
  );

  // Step 2 - Generate Transaction Message
  let messageV0;
  if (addressLookupTable) {

    const result: AddressLookupTableAccount[] = []
    for (const address of addressLookupTable) {
      const lookupTableAccount = (
        await provider.connection.getAddressLookupTable(address)
      ).value;
      if (!lookupTableAccount) throw new Error("Address Lookup Table not found");
      result.push(lookupTableAccount)
    }

    messageV0 = new anchor.web3.TransactionMessage({
      payerKey: payer.publicKey,
      recentBlockhash: latestBlockhash.blockhash,
      instructions: txInstructions,
    }).compileToV0Message(result);
  } else {
    messageV0 = new anchor.web3.TransactionMessage({
      payerKey: payer.publicKey,
      recentBlockhash: latestBlockhash.blockhash,
      instructions: txInstructions,
    }).compileToV0Message();
  }

  console.log("   ✅ - Compiled Transaction Message");
  const transaction = new anchor.web3.VersionedTransaction(messageV0);

  // Step 3 - Sign your transaction with the required `Signers`
  transaction.sign([payer]);
  console.log("   ✅ - Transaction Signed");

  // Step 4 - Send our v0 transaction to the cluster
  const txid = await provider.connection.sendTransaction(transaction, {
    maxRetries: 5,
  }).catch(err => {
    console.error(err)
    if (err.logs) {
      err.logs.forEach(element => {
        console.error(element)
      });
    }
    throw new Error(err)
  });
  console.log("   ✅ - Transaction sent to network");

  // Step 5 - Confirm Transaction
  const confirmation = await provider.connection.confirmTransaction({
    signature: txid,
    blockhash: latestBlockhash.blockhash,
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
  }, 'confirmed');

  if (confirmation.value.err) {
    throw new Error(
      `   ❌ - Transaction not confirmed.\nReason: ${confirmation.value.err}`
    );
  }

  console.log("🎉 Transaction Successfully Confirmed!");
  return txid;
}

export async function createTable(provider: anchor.AnchorProvider, accounts: PublicKey[], signer: Signer) {

  const slot = await provider.connection.getSlot() - 1;
  const [lookupTableInst, lookupTableAddress] =
    anchor.web3.AddressLookupTableProgram.createLookupTable({
      authority: signer.publicKey,
      payer: signer.publicKey,
      recentSlot: slot,
    });

  await createAndSendV0Tx(provider, [lookupTableInst], signer);

  const size = 20;
  for (let i = 0; i < accounts.length; i += size) {
    const sub = accounts.slice(i, i + size)
    const extendInstruction = anchor.web3.AddressLookupTableProgram.extendLookupTable({
      payer: signer.publicKey,
      authority: signer.publicKey,
      lookupTable: lookupTableAddress,
      addresses: [
        ...sub,
      ]
    });

    await createAndSendV0Tx(provider, [extendInstruction], signer);
    console.log("Table created.")
  }
  return lookupTableAddress;
}