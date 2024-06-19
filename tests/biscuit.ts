import * as anchor from "@coral-xyz/anchor";
import * as assert from "assert";
import { Program, BorshAccountsCoder } from "@coral-xyz/anchor";
import { Biscuit } from "../target/types/biscuit";
import { BN } from "bn.js";
import { createAndMintToken, mintTokens,  createAndSendV0Tx, PAYMENT_TOKEN, PORTFOLIO_TOKENS, createTable } from "./helpers";
import {createTestPool} from "../scripts/helpers/createPool";
import { PublicKey, ComputeBudgetProgram, TransactionInstruction } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction, createTransferInstruction } from "../node_modules/@solana/spl-token";
import { getPortfolioCollectionAddresses, getPortfolioCollectionData } from "../sdk/collection";
import { BurnModel, TOKEN_METADATA_PROGRAM_ID } from "../sdk/constants";
import { getBurnPortfolioInstruction, getBuyPortfolioInstruction, getInvertSwapPortfolioData, getPortfolioAddresses, getReceivePortfolioInstruction, getSwapData, getSwapPortfolioData, getSwapPortfolioInstruction, getWithdrawPortfolioInstruction } from "../sdk";
import { expect } from "chai";
import { getInvertSwapPortfolioInstruction } from "../sdk/instructions/invert_swap";

describe("biscuit", () => {
    const treasury = anchor.web3.Keypair.generate();
    const users = new Array(3).fill(0).map(() => anchor.web3.Keypair.generate());
    const mint_amount = 1_000_000_000_000_000;
    const provider = anchor.AnchorProvider.env()
    const wallet = provider.wallet as anchor.Wallet;
    const program = anchor.workspace.Biscuit as Program<Biscuit>;

    const config_address = anchor.web3.PublicKey.findProgramAddressSync(
        [
            Buffer.from("config"),
        ],
        program.programId
    )[0];

    const vault_address = anchor.web3.PublicKey.findProgramAddressSync(
        [
            Buffer.from("vault"),
        ],
        program.programId
    )[0];


    let portfolio_lookup_table;
    let treasury_payment_token_account: PublicKey;
    let treasury_portfolio_token_accounts: PublicKey[] = [];

    before(async () => {
        await provider.connection.requestAirdrop(users[0].publicKey, 10000000000);
        await provider.connection.requestAirdrop(users[1].publicKey, 10000000000);
        await provider.connection.requestAirdrop(users[2].publicKey, 10000000000);
        const recipients = users.map(e => e.publicKey);
        recipients.push(wallet.publicKey);

        await createAndMintToken(provider.connection, wallet.payer, PAYMENT_TOKEN.decimals, mint_amount, recipients, PAYMENT_TOKEN.keyPair);

        for (const token of PORTFOLIO_TOKENS) {
            if (token.keyPair.secretKey) {
                await createAndMintToken(provider.connection, wallet.payer, token.decimals, mint_amount, [wallet.publicKey], token.keyPair);
                token.key = token.keyPair.publicKey
            }
        }

        console.log('Tokens created')
        const instructionsTreasury: TransactionInstruction[] = [];
        for (const token of PORTFOLIO_TOKENS) {
            await createTestPool(
                provider,
                PAYMENT_TOKEN.key,
                token.key,
                PAYMENT_TOKEN.decimals,
                token.decimals,
                token.price,
                10
            )

            const ata_treasury = getAssociatedTokenAddressSync(
                token.key,
                treasury.publicKey,
                false
            );

            treasury_portfolio_token_accounts.push(ata_treasury);

            instructionsTreasury.push(createAssociatedTokenAccountInstruction(
                wallet.publicKey,
                ata_treasury,
                treasury.publicKey,
                token.key
            ))
        }

        await createAndSendV0Tx(provider, instructionsTreasury, wallet.payer);
    })

    it("Initialize the program", async () => {
        const tx = await program.methods.initialize(
            new anchor.BN(9999),
            treasury.publicKey
        ).accounts({
            config: config_address,
            vault: vault_address,
            payer: wallet.publicKey
        }).signers([wallet.payer]).rpc();

        treasury_payment_token_account = getAssociatedTokenAddressSync(
            PAYMENT_TOKEN.key,
            treasury.publicKey,
            true
        );

        const ata_instruction = createAssociatedTokenAccountInstruction(
            wallet.publicKey,
            treasury_payment_token_account,
            treasury.publicKey,
            PAYMENT_TOKEN.key,
        );

        await createAndSendV0Tx(provider, [ata_instruction], wallet.payer);
    });

    it("Create portfolio", async () => {
        const portfolio_id = 1;

        const portfolio_collection = getPortfolioCollectionAddresses(portfolio_id);
        // @ts-ignore
        const instruction = await program.methods.createPortfolio(portfolio_id,
            "test_collection_uri_1",
            PORTFOLIO_TOKENS.map(e => e.key),
            Uint32Array.from(PORTFOLIO_TOKENS.map(e => e.percent)),
            500,
            1000
        )
            .accounts({
                payer: wallet.publicKey,
                config: config_address,
                mint: portfolio_collection.collection,
                metadata: portfolio_collection.metadata,
                masterEdition: portfolio_collection.masterEdition,
                onchainData: portfolio_collection.collectionOnchaindata,
                mplProgram: TOKEN_METADATA_PROGRAM_ID,
                sysvarInstructions: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
            })
            .signers([wallet.payer]).instruction();

        await createAndSendV0Tx(provider, [instruction], wallet.payer);

        const wrpool = await getSwapPortfolioData(
            provider.connection,
            portfolio_collection.collection,
            new anchor.BN(0),
            PAYMENT_TOKEN,
            PORTFOLIO_TOKENS
        );

        const wrpoolInverts = await getInvertSwapPortfolioData(
            provider.connection,
            portfolio_collection.collection,
            PAYMENT_TOKEN,
            PORTFOLIO_TOKENS.map(e => ({ ...e, amount: new BN(0) }))
        );

        const wp = [];
        wrpool.accounts.forEach((e, i) => {
            if (i % 8 !== 0) {
                wp.push(e.pubkey)
            }
        })
        wrpoolInverts.accounts.forEach((e, i) => {
            if (i % 8 !== 0) {
                wp.push(e.pubkey)
            }
        })

        const accs = [portfolio_collection.collection, ...wp, ...PORTFOLIO_TOKENS.map(e => e.key), ...treasury_portfolio_token_accounts]

        portfolio_lookup_table = await createTable(provider, accs, wallet.payer);

    });

    it("Buy portfolio", async () => {
        const collection_id = 1;
        const portfolio_id = 1;
        const amount = new BN(1000).mul(new BN(10).pow(new BN(PAYMENT_TOKEN.decimals)));

        const additionalComputeBudgetInstruction = ComputeBudgetProgram.setComputeUnitLimit({
            units: 500000,
        });

        const instruction = await getBuyPortfolioInstruction(
            program,
            portfolio_id,
            collection_id,
            PAYMENT_TOKEN.key,
            users[0].publicKey,
            'test_portfolio_uri_1',
            amount,
            treasury.publicKey,
        );

        await createAndSendV0Tx(provider, [additionalComputeBudgetInstruction, instruction], users[0], [portfolio_lookup_table]);

        expect((await provider.connection.getTokenAccountBalance(treasury_payment_token_account)).value.amount).to.be.equal('5000000');
        

        const collection = getPortfolioCollectionAddresses(collection_id)
        const portfolio = getPortfolioAddresses(collection.collection, portfolio_id, users[0].publicKey);

        const portfolio_funds = getAssociatedTokenAddressSync(
            PAYMENT_TOKEN.key,
            portfolio.mint,
            true
        )
        expect((await provider.connection.getTokenAccountBalance(portfolio_funds)).value.amount).to.be.equal('995000000');


        const instructions: TransactionInstruction[] = [];
        for (const token of PORTFOLIO_TOKENS) {

            const ata = getAssociatedTokenAddressSync(
                token.key,
                portfolio.mint,
                true
            );

            instructions.push(createAssociatedTokenAccountInstruction(
                wallet.publicKey,
                ata,
                portfolio.mint,
                token.key
            ))
        }

        await createAndSendV0Tx(provider, instructions, wallet.payer);
    });

    it("Swap portfolio", async () => {

        const portfolio_id = 1;
        const collection_id = 1;

        const portfolio_collection = getPortfolioCollectionAddresses(collection_id);
        const portfolio = getPortfolioAddresses(portfolio_collection.collection, portfolio_id, users[0].publicKey);

        const swap_data = await getSwapPortfolioData(
            provider.connection,
            portfolio.mint,
            new BN(1000).mul(new BN(10).pow(new BN(PAYMENT_TOKEN.decimals))),
            PAYMENT_TOKEN,
            PORTFOLIO_TOKENS
        );

        const instructions = await getSwapPortfolioInstruction(
            program,
            swap_data,
            4,
            portfolio_id,
            collection_id,
            PAYMENT_TOKEN.key,
            users[0].publicKey,
        );

        const additionalComputeBudgetInstruction = ComputeBudgetProgram.setComputeUnitLimit({
            units: 600000,
        });

        await createAndSendV0Tx(provider, [additionalComputeBudgetInstruction, instructions[0]], users[0], [portfolio_lookup_table]);
        await createAndSendV0Tx(provider, [additionalComputeBudgetInstruction, instructions[1]], users[0], [portfolio_lookup_table]);

    })

    it("Receive portfolio", async () => {
        const collection_id = 1;
        const portfolio_id = 1;

        const instructions: TransactionInstruction[] = await getReceivePortfolioInstruction(
            program,
            portfolio_id,
            collection_id,
            users[0].publicKey,
            true,
        );

        await createAndSendV0Tx(provider, instructions, users[0]);
    })

    it("Transfer portfolio", async () => {

        const collection_id = 1;
        const portfolios_id = 1;

        const portfolio_collection = getPortfolioCollectionAddresses(collection_id);
        const portfolio = getPortfolioAddresses(portfolio_collection.collection, portfolios_id, users[0].publicKey);

        const nft_user1_ata = getAssociatedTokenAddressSync(
            portfolio.mint,
            users[0].publicKey,
            false
        );

        const nft_user2_ata = getAssociatedTokenAddressSync(
            portfolio.mint,
            users[1].publicKey,
            false
        );

        const user_nft_ata_instruction = createAssociatedTokenAccountInstruction(
            wallet.publicKey,
            nft_user2_ata,
            users[1].publicKey,
            portfolio.mint
        );

        await createAndSendV0Tx(provider, [user_nft_ata_instruction], wallet.payer);

        const instruction = createTransferInstruction(
            nft_user1_ata,
            nft_user2_ata,
            users[0].publicKey,
            1
        );

        await createAndSendV0Tx(provider, [instruction], users[0])

        expect((await provider.connection.getTokenAccountBalance(nft_user1_ata)).value.amount).to.be.equal('0');
        expect((await provider.connection.getTokenAccountBalance(nft_user2_ata)).value.amount).to.be.equal('1');
    });

    describe.skip("Burn raw", () => {
        it("burn", async () => {

            const collection_id = 1;
            const portfolio_id = 1;

            const portfolio_collection = getPortfolioCollectionAddresses(collection_id);
            const portfolio = getPortfolioAddresses(portfolio_collection.collection, portfolio_id, users[1].publicKey);

            const instruction = await getBurnPortfolioInstruction(
                program,
                portfolio_id,
                collection_id,
                PAYMENT_TOKEN.key,
                users[1].publicKey,
                BurnModel.Raw
            );

            await createAndSendV0Tx(provider, [instruction], users[1]);

        })

        it("withdraw", async () => {

            const collection_id = 1;
            const portfolio_id = 1;

            const portfolio_collection = getPortfolioCollectionAddresses(collection_id);
            const portfolio = getPortfolioAddresses(portfolio_collection.collection, portfolio_id, users[0].publicKey);

            const additionalComputeBudgetInstruction = ComputeBudgetProgram.setComputeUnitLimit({
                units: 600000,
            });

            const instructions: TransactionInstruction[] = [];
            const atas = []
            for (const token of PORTFOLIO_TOKENS) {
                const ata = getAssociatedTokenAddressSync(
                    token.key,
                    users[1].publicKey,
                    false
                );
                const nft_ata = getAssociatedTokenAddressSync(
                    token.key,
                    portfolio.mint,
                    true
                );

                atas.push(nft_ata);

                instructions.push(createAssociatedTokenAccountInstruction(
                    wallet.publicKey,
                    ata,
                    users[1].publicKey,
                    token.key
                ))
            }

            await createAndSendV0Tx(provider, instructions, wallet.payer);

            const portfolio_table = await createTable(provider, atas, wallet.payer);

            // delay 2000 ms
            await new Promise((resolve) => setTimeout(resolve, 2000));

            // await createAndSendV0Tx(provider, instructionsTreasury, wallet.payer);

            const instruction = await getWithdrawPortfolioInstruction(
                program,
                portfolio_id,
                collection_id,
                PAYMENT_TOKEN.key,
                users[1].publicKey,
                PORTFOLIO_TOKENS.map(e => e.key),
                BurnModel.Raw,
                treasury.publicKey
            );

            await createAndSendV0Tx(provider, [additionalComputeBudgetInstruction, instruction], users[1], [portfolio_lookup_table, portfolio_table]);
        })
    })

    describe("Burn swap", () => {

        it("burn", async () => {

            const collection_id = 1;
            const portfolio_id = 1;

            const instruction = await getBurnPortfolioInstruction(
                program,
                portfolio_id,
                collection_id,
                PAYMENT_TOKEN.key,
                users[1].publicKey,
                BurnModel.Swap
            );

            await createAndSendV0Tx(provider, [instruction], users[1]);

        })

        it("invert swap", async () => {

            const collection_id = 1;
            const portfolio_id = 1;

            const portfolio_collection = getPortfolioCollectionAddresses(collection_id);
            const portfolio = getPortfolioAddresses(portfolio_collection.collection, portfolio_id, users[1].publicKey);

            const result = []
            for (const token of PORTFOLIO_TOKENS) {
                const acc = getAssociatedTokenAddressSync(
                    token.key,
                    portfolio.mint,
                    true
                );
                const balance = await provider.connection.getTokenAccountBalance(acc);
                result.push({ ...token, amount: balance.value.amount })
            }

            const swap_data = await getInvertSwapPortfolioData(
                provider.connection,
                portfolio.mint,
                PAYMENT_TOKEN,
                result
            );

            const additionalComputeBudgetInstruction = ComputeBudgetProgram.setComputeUnitLimit({
                units: 600000,
            })

            const instructions = await getInvertSwapPortfolioInstruction(
                program,
                swap_data,
                4,
                portfolio_id,
                collection_id,
                PAYMENT_TOKEN.key,
                users[1].publicKey,
            );

            await createAndSendV0Tx(provider, [additionalComputeBudgetInstruction, instructions[0]], users[1], [portfolio_lookup_table]);
            await createAndSendV0Tx(provider, [additionalComputeBudgetInstruction, instructions[1]], users[1], [portfolio_lookup_table]);
        })

        it("withdraw", async () => {

            const collection_id = 1;
            const portfolio_id = 1;

            const portfolio_collection = getPortfolioCollectionAddresses(collection_id);
            const portfolio = getPortfolioAddresses(portfolio_collection.collection, portfolio_id, users[0].publicKey);

            const additionalComputeBudgetInstruction = ComputeBudgetProgram.setComputeUnitLimit({
                units: 500000,
            });

            const instruction = await getWithdrawPortfolioInstruction(
                program,
                portfolio_id,
                collection_id,
                PAYMENT_TOKEN.key,
                users[1].publicKey,
                PORTFOLIO_TOKENS.map(e => e.key),
                BurnModel.Swap,
                treasury.publicKey
            );
            await createAndSendV0Tx(provider, [additionalComputeBudgetInstruction, instruction], users[1], [portfolio_lookup_table]);
        })
    })
});