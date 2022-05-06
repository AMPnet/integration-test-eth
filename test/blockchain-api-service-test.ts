// @ts-ignore
import {ethers} from "hardhat";
import {expect} from "chai";
import {after, it} from "mocha";
import * as docker from "../util/docker";
import * as blockchainApiService from "../util/blockchain-api-service";
import * as db from "../util/db";
import {TestData} from "../tokenizer-prototype/test/TestData";
import {CreateBalanceCheckRequest, CreateSendRequest} from "../util/blockchain-api-service";

describe("Blockchain API Service test", function () {

    let testData!: TestData

    before(async function () {
        await docker.network.create();
        await docker.hardhat.up();
    });

    beforeEach(async function () {
        testData = new TestData();
        await testData.deploy();
        await docker.blockchainApi.up();
        await db.clearBlockchainApiDb();
    });

    afterEach(async function () {
        await docker.blockchainApi.down();
    });

    after(async function () {
        await docker.hardhat.down();
        await docker.network.remove();
    });

    it("Should create balance check request with clientId and correctly sign the message (✅)", async function () {
        // insert client info into database
        const clientId = "test-client-id";
        const chainId = await testData.frank.getChainId();
        const redirectUrlBase = "https://example.com/";
        const redirectUrl = redirectUrlBase + "${id}";
        const tokenAddress = testData.stablecoin.address.toLowerCase();
        await db.insertClientInfo(clientId, {
            chainId: chainId,
            tokenAddress: tokenAddress,
            balanceRedirectUrl: redirectUrl
        });

        // create balance check request
        const signer = testData.alice;
        const walletAddress = (await signer.getAddress()).toLocaleLowerCase();
        const amount = "10000";
        await testData.stablecoin.transfer(walletAddress, amount);
        const request: CreateBalanceCheckRequest = {
            client_id: clientId,
            wallet_address: walletAddress,
            arbitrary_data: {
                test_data: true
            },
            screen_config: {
                title: "title",
                message: "message",
                logo: "logo"
            }
        }
        const balanceCheckRequest = await blockchainApiService.createBalanceCheckRequest(request);

        // fetch created balance check request
        const fetchedBalanceCheckRequest = await blockchainApiService.getBalanceCheckRequestById(balanceCheckRequest.id);

        expect(fetchedBalanceCheckRequest.id).to.be.equal(balanceCheckRequest.id);
        expect(fetchedBalanceCheckRequest.status).to.be.equal("PENDING");
        expect(fetchedBalanceCheckRequest.chain_id).to.be.equal(chainId);
        expect(fetchedBalanceCheckRequest.redirect_url).to.be.equal(redirectUrlBase + balanceCheckRequest.id);
        expect(fetchedBalanceCheckRequest.token_address).to.be.equal(tokenAddress);
        expect(fetchedBalanceCheckRequest.block_number).to.be.null;
        expect(fetchedBalanceCheckRequest.wallet_address).to.be.equal(walletAddress);
        expect(fetchedBalanceCheckRequest.arbitrary_data).to.be.deep.equal(request.arbitrary_data);
        expect(fetchedBalanceCheckRequest.screen_config).to.be.deep.equal(request.screen_config);
        expect(fetchedBalanceCheckRequest.balance).to.be.null;
        expect(fetchedBalanceCheckRequest.message_to_sign).to.not.be.null;
        expect(fetchedBalanceCheckRequest.signed_message).to.be.null;

        // sign message
        const signedMessage = await signer.signMessage(fetchedBalanceCheckRequest.message_to_sign);

        // attach wallet address and signed message
        await blockchainApiService.attachWalletAddressAndSignedMessage(
          fetchedBalanceCheckRequest.id,
          walletAddress,
          signedMessage
        );

        // fetch balance check request and check if it is successful
        const successfulRequest = await blockchainApiService.getBalanceCheckRequestById(fetchedBalanceCheckRequest.id);

        expect(successfulRequest.id).to.be.equal(balanceCheckRequest.id);
        expect(successfulRequest.status).to.be.equal("SUCCESS");
        expect(successfulRequest.chain_id).to.be.equal(chainId);
        expect(successfulRequest.redirect_url).to.be.equal(redirectUrlBase + balanceCheckRequest.id);
        expect(successfulRequest.token_address).to.be.equal(tokenAddress);
        expect(successfulRequest.block_number).to.be.null;
        expect(successfulRequest.wallet_address).to.be.equal(walletAddress);
        expect(successfulRequest.arbitrary_data).to.be.deep.equal(request.arbitrary_data);
        expect(successfulRequest.screen_config).to.be.deep.equal(request.screen_config);
        expect(successfulRequest.balance.wallet).to.be.equal(walletAddress);
        expect(successfulRequest.balance.amount).to.be.equal(amount);
        expect(successfulRequest.message_to_sign).to.not.be.null;
        expect(successfulRequest.signed_message).to.be.equal(signedMessage.toLowerCase());
    });

    it("Should create balance check request with chainId, redirectUrl and tokenAddress and correctly sign the message (✅)", async function () {
        // insert client info into database
        const chainId = await testData.frank.getChainId();
        const redirectUrlBase = "https://example.com/";
        const redirectUrl = redirectUrlBase + "${id}";
        const tokenAddress = testData.stablecoin.address.toLowerCase();

        // create balance check request
        const signer = testData.alice;
        const walletAddress = (await signer.getAddress()).toLocaleLowerCase();
        const amount = "10000";
        await testData.stablecoin.transfer(walletAddress, amount);
        const request: CreateBalanceCheckRequest = {
            chain_id: chainId,
            redirect_url: redirectUrl,
            token_address: tokenAddress,
            wallet_address: walletAddress,
            arbitrary_data: {
                test_data: true
            },
            screen_config: {
                title: "title",
                message: "message",
                logo: "logo"
            }
        }
        const balanceCheckRequest = await blockchainApiService.createBalanceCheckRequest(request);

        // fetch created balance check request
        const fetchedBalanceCheckRequest = await blockchainApiService.getBalanceCheckRequestById(balanceCheckRequest.id);

        expect(fetchedBalanceCheckRequest.id).to.be.equal(balanceCheckRequest.id);
        expect(fetchedBalanceCheckRequest.status).to.be.equal("PENDING");
        expect(fetchedBalanceCheckRequest.chain_id).to.be.equal(chainId);
        expect(fetchedBalanceCheckRequest.redirect_url).to.be.equal(redirectUrlBase + balanceCheckRequest.id);
        expect(fetchedBalanceCheckRequest.token_address).to.be.equal(tokenAddress);
        expect(fetchedBalanceCheckRequest.block_number).to.be.null;
        expect(fetchedBalanceCheckRequest.wallet_address).to.be.equal(walletAddress);
        expect(fetchedBalanceCheckRequest.arbitrary_data).to.be.deep.equal(request.arbitrary_data);
        expect(fetchedBalanceCheckRequest.screen_config).to.be.deep.equal(request.screen_config);
        expect(fetchedBalanceCheckRequest.balance).to.be.null;
        expect(fetchedBalanceCheckRequest.message_to_sign).to.not.be.null;
        expect(fetchedBalanceCheckRequest.signed_message).to.be.null;

        // sign message
        const signedMessage = await signer.signMessage(fetchedBalanceCheckRequest.message_to_sign);

        // attach wallet address and signed message
        await blockchainApiService.attachWalletAddressAndSignedMessage(
          fetchedBalanceCheckRequest.id,
          walletAddress,
          signedMessage
        );

        // fetch balance check request and check if it is successful
        const successfulRequest = await blockchainApiService.getBalanceCheckRequestById(fetchedBalanceCheckRequest.id);

        expect(successfulRequest.id).to.be.equal(balanceCheckRequest.id);
        expect(successfulRequest.status).to.be.equal("SUCCESS");
        expect(successfulRequest.chain_id).to.be.equal(chainId);
        expect(successfulRequest.redirect_url).to.be.equal(redirectUrlBase + balanceCheckRequest.id);
        expect(successfulRequest.token_address).to.be.equal(tokenAddress);
        expect(successfulRequest.block_number).to.be.null;
        expect(successfulRequest.wallet_address).to.be.equal(walletAddress);
        expect(successfulRequest.arbitrary_data).to.be.deep.equal(request.arbitrary_data);
        expect(successfulRequest.screen_config).to.be.deep.equal(request.screen_config);
        expect(successfulRequest.balance.wallet).to.be.equal(walletAddress);
        expect(successfulRequest.balance.amount).to.be.equal(amount);
        expect(successfulRequest.message_to_sign).to.not.be.null;
        expect(successfulRequest.signed_message).to.be.equal(signedMessage.toLowerCase());
    });

    it("Should create balance check request with clientId and submit wrong signature (❌)", async function () {
        // insert client info into database
        const clientId = "test-client-id";
        const chainId = await testData.frank.getChainId();
        const redirectUrlBase = "https://example.com/";
        const redirectUrl = redirectUrlBase + "${id}";
        const tokenAddress = testData.stablecoin.address.toLowerCase();
        await db.insertClientInfo(clientId, {
            chainId: chainId,
            tokenAddress: tokenAddress,
            balanceRedirectUrl: redirectUrl
        });

        // create balance check request
        const signer = testData.alice;
        const walletAddress = (await signer.getAddress()).toLocaleLowerCase();
        const amount = "10000";
        await testData.stablecoin.transfer(walletAddress, amount);
        const request: CreateBalanceCheckRequest = {
            client_id: clientId,
            wallet_address: walletAddress,
            arbitrary_data: {
                test_data: true
            },
            screen_config: {
                title: "title",
                message: "message",
                logo: "logo"
            }
        }
        const balanceCheckRequest = await blockchainApiService.createBalanceCheckRequest(request);

        // fetch created balance check request
        const fetchedBalanceCheckRequest = await blockchainApiService.getBalanceCheckRequestById(balanceCheckRequest.id);

        expect(fetchedBalanceCheckRequest.id).to.be.equal(balanceCheckRequest.id);
        expect(fetchedBalanceCheckRequest.status).to.be.equal("PENDING");
        expect(fetchedBalanceCheckRequest.chain_id).to.be.equal(chainId);
        expect(fetchedBalanceCheckRequest.redirect_url).to.be.equal(redirectUrlBase + balanceCheckRequest.id);
        expect(fetchedBalanceCheckRequest.token_address).to.be.equal(tokenAddress);
        expect(fetchedBalanceCheckRequest.block_number).to.be.null;
        expect(fetchedBalanceCheckRequest.wallet_address).to.be.equal(walletAddress);
        expect(fetchedBalanceCheckRequest.arbitrary_data).to.be.deep.equal(request.arbitrary_data);
        expect(fetchedBalanceCheckRequest.screen_config).to.be.deep.equal(request.screen_config);
        expect(fetchedBalanceCheckRequest.balance).to.be.null;
        expect(fetchedBalanceCheckRequest.message_to_sign).to.not.be.null;
        expect(fetchedBalanceCheckRequest.signed_message).to.be.null;

        // sign message incorrectly
        const signedMessage = "0xabcdef";

        // attach wallet address and signed message
        await blockchainApiService.attachWalletAddressAndSignedMessage(
          fetchedBalanceCheckRequest.id,
          walletAddress,
          signedMessage
        );

        // fetch balance check request and check if it is successful
        const successfulRequest = await blockchainApiService.getBalanceCheckRequestById(fetchedBalanceCheckRequest.id);

        expect(successfulRequest.id).to.be.equal(balanceCheckRequest.id);
        expect(successfulRequest.status).to.be.equal("FAILED");
        expect(successfulRequest.chain_id).to.be.equal(chainId);
        expect(successfulRequest.redirect_url).to.be.equal(redirectUrlBase + balanceCheckRequest.id);
        expect(successfulRequest.token_address).to.be.equal(tokenAddress);
        expect(successfulRequest.block_number).to.be.null;
        expect(successfulRequest.wallet_address).to.be.equal(walletAddress);
        expect(successfulRequest.arbitrary_data).to.be.deep.equal(request.arbitrary_data);
        expect(successfulRequest.screen_config).to.be.deep.equal(request.screen_config);
        expect(successfulRequest.balance.wallet).to.be.equal(walletAddress);
        expect(successfulRequest.balance.amount).to.be.equal(amount);
        expect(successfulRequest.message_to_sign).to.not.be.null;
        expect(successfulRequest.signed_message).to.be.equal(signedMessage.toLowerCase());
    });

    it("Should create balance check request with clientId and sign request from wrong wallet (❌)", async function () {
        // insert client info into database
        const clientId = "test-client-id";
        const chainId = await testData.frank.getChainId();
        const redirectUrlBase = "https://example.com/";
        const redirectUrl = redirectUrlBase + "${id}";
        const tokenAddress = testData.stablecoin.address.toLowerCase();
        await db.insertClientInfo(clientId, {
            chainId: chainId,
            tokenAddress: tokenAddress,
            balanceRedirectUrl: redirectUrl
        });

        // create balance check request
        const walletAddress = (await testData.alice.getAddress()).toLocaleLowerCase();
        const amount = "10000";
        await testData.stablecoin.transfer(walletAddress, amount);
        const request: CreateBalanceCheckRequest = {
            client_id: clientId,
            wallet_address: walletAddress,
            arbitrary_data: {
                test_data: true
            },
            screen_config: {
                title: "title",
                message: "message",
                logo: "logo"
            }
        }
        const balanceCheckRequest = await blockchainApiService.createBalanceCheckRequest(request);

        // fetch created balance check request
        const fetchedBalanceCheckRequest = await blockchainApiService.getBalanceCheckRequestById(balanceCheckRequest.id);

        expect(fetchedBalanceCheckRequest.id).to.be.equal(balanceCheckRequest.id);
        expect(fetchedBalanceCheckRequest.status).to.be.equal("PENDING");
        expect(fetchedBalanceCheckRequest.chain_id).to.be.equal(chainId);
        expect(fetchedBalanceCheckRequest.redirect_url).to.be.equal(redirectUrlBase + balanceCheckRequest.id);
        expect(fetchedBalanceCheckRequest.token_address).to.be.equal(tokenAddress);
        expect(fetchedBalanceCheckRequest.block_number).to.be.null;
        expect(fetchedBalanceCheckRequest.wallet_address).to.be.equal(walletAddress);
        expect(fetchedBalanceCheckRequest.arbitrary_data).to.be.deep.equal(request.arbitrary_data);
        expect(fetchedBalanceCheckRequest.screen_config).to.be.deep.equal(request.screen_config);
        expect(fetchedBalanceCheckRequest.balance).to.be.null;
        expect(fetchedBalanceCheckRequest.message_to_sign).to.not.be.null;
        expect(fetchedBalanceCheckRequest.signed_message).to.be.null;

        // sign message
        const signer = testData.frank;
        const otherWalletAddress = (await signer.getAddress()).toLocaleLowerCase();
        const otherAmount = "20000";
        await testData.stablecoin.transfer(otherWalletAddress, otherAmount);
        const signedMessage = await signer.signMessage(fetchedBalanceCheckRequest.message_to_sign);

        // attach wallet address and signed message
        await blockchainApiService.attachWalletAddressAndSignedMessage(
          fetchedBalanceCheckRequest.id,
          otherWalletAddress,
          signedMessage
        );

        // fetch balance check request and check if it is successful
        const successfulRequest = await blockchainApiService.getBalanceCheckRequestById(fetchedBalanceCheckRequest.id);

        expect(successfulRequest.id).to.be.equal(balanceCheckRequest.id);
        expect(successfulRequest.status).to.be.equal("FAILED");
        expect(successfulRequest.chain_id).to.be.equal(chainId);
        expect(successfulRequest.redirect_url).to.be.equal(redirectUrlBase + balanceCheckRequest.id);
        expect(successfulRequest.token_address).to.be.equal(tokenAddress);
        expect(successfulRequest.block_number).to.be.null;
        expect(successfulRequest.wallet_address).to.be.equal(walletAddress);
        expect(successfulRequest.arbitrary_data).to.be.deep.equal(request.arbitrary_data);
        expect(successfulRequest.screen_config).to.be.deep.equal(request.screen_config);
        expect(successfulRequest.balance.wallet).to.be.equal(otherWalletAddress);
        expect(successfulRequest.balance.amount).to.be.equal(otherAmount);
        expect(successfulRequest.message_to_sign).to.not.be.null;
        expect(successfulRequest.signed_message).to.be.equal(signedMessage.toLowerCase());
    });

    it("Should create send request with clientId and correctly send funds (✅)", async function () {
        // insert client info into database
        const clientId = "test-client-id";
        const chainId = await testData.frank.getChainId();
        const redirectUrlBase = "https://example.com/";
        const redirectUrl = redirectUrlBase + "${id}";
        const tokenAddress = testData.stablecoin.address.toLowerCase();
        await db.insertClientInfo(clientId, {
            chainId: chainId,
            tokenAddress: tokenAddress,
            sendRedirectUrl: redirectUrl
        });

        // create send request
        const recipientAddress = (await testData.alice.getAddress()).toLocaleLowerCase();
        const amount = "1000";
        const request: CreateSendRequest = {
            client_id: clientId,
            amount: amount,
            recipient_address: recipientAddress,
            arbitrary_data: {
                test_data: true
            },
            screen_config: {
                title: "title",
                message: "message",
                logo: "logo"
            }
        }
        const sendRequest = await blockchainApiService.createSendRequest(request);

        // fetch created send request
        const fetchedSendRequest = await blockchainApiService.getSendRequestById(sendRequest.id);

        expect(fetchedSendRequest.id).to.be.equal(sendRequest.id);
        expect(fetchedSendRequest.status).to.be.equal("PENDING");
        expect(fetchedSendRequest.chain_id).to.be.equal(chainId);
        expect(fetchedSendRequest.token_address).to.be.equal(tokenAddress);
        expect(fetchedSendRequest.amount).to.be.equal(amount);
        expect(fetchedSendRequest.sender_address).to.be.null;
        expect(fetchedSendRequest.recipient_address).to.be.equal(recipientAddress);
        expect(fetchedSendRequest.arbitrary_data).to.be.deep.equal(request.arbitrary_data);
        expect(fetchedSendRequest.screen_config).to.be.deep.equal(request.screen_config);
        expect(fetchedSendRequest.redirect_url).to.be.equal(redirectUrlBase + sendRequest.id);
        expect(fetchedSendRequest.send_tx.tx_hash).to.be.null;
        expect(fetchedSendRequest.send_tx.from).to.be.null;
        expect(fetchedSendRequest.send_tx.to).to.be.equal(tokenAddress);
        expect(fetchedSendRequest.send_tx.data).to.not.be.null;
        expect(fetchedSendRequest.send_tx.block_confirmations).to.be.null;

        // send funds
        const sender = testData.frank;
        const senderAddress = (await sender.getAddress()).toLowerCase();
        await testData.stablecoin.transfer(senderAddress, amount);

        const tx = await sender.sendTransaction({
            from: senderAddress,
            to: fetchedSendRequest.send_tx.to,
            data: fetchedSendRequest.send_tx.data
        });
        const txHash = tx.hash.toLowerCase();

        // attach tx hash
        await blockchainApiService.attachTransactionHash(sendRequest.id, txHash);

        // fetch send request and check if it is successful
        const successfulSendRequest = await blockchainApiService.getSendRequestById(sendRequest.id);

        expect(successfulSendRequest.id).to.be.equal(sendRequest.id);
        expect(successfulSendRequest.status).to.be.equal("SUCCESS");
        expect(successfulSendRequest.chain_id).to.be.equal(chainId);
        expect(successfulSendRequest.token_address).to.be.equal(tokenAddress);
        expect(successfulSendRequest.amount).to.be.equal(amount);
        expect(successfulSendRequest.sender_address).to.be.null;
        expect(successfulSendRequest.recipient_address).to.be.equal(recipientAddress);
        expect(successfulSendRequest.arbitrary_data).to.be.deep.equal(request.arbitrary_data);
        expect(successfulSendRequest.screen_config).to.be.deep.equal(request.screen_config);
        expect(successfulSendRequest.redirect_url).to.be.equal(redirectUrlBase + sendRequest.id);
        expect(successfulSendRequest.send_tx.tx_hash).to.be.equal(txHash);
        expect(successfulSendRequest.send_tx.from).to.be.equal(senderAddress);
        expect(successfulSendRequest.send_tx.to).to.be.equal(tokenAddress);
        expect(successfulSendRequest.send_tx.data).to.not.be.null;
        expect(successfulSendRequest.send_tx.block_confirmations).to.not.be.null;

        // check that funds were correctly sent
        const receivedAmount = await testData.stablecoin.balanceOf(recipientAddress);
        expect(receivedAmount).to.be.equal(amount);
    });

    it("Should create send request with chainId, redirectUrl and tokenAddress and correctly send funds (✅)", async function () {
        const chainId = await testData.frank.getChainId();
        const redirectUrlBase = "https://example.com/";
        const redirectUrl = redirectUrlBase + "${id}";

        // create send request
        const recipientAddress = (await testData.alice.getAddress()).toLocaleLowerCase();
        const tokenAddress = testData.stablecoin.address.toLowerCase();
        const amount = "1000";
        const request: CreateSendRequest = {
            chain_id: chainId,
            redirect_url: redirectUrl,
            token_address: tokenAddress,
            amount: amount,
            recipient_address: recipientAddress,
            arbitrary_data: {
                test_data: true
            },
            screen_config: {
                title: "title",
                message: "message",
                logo: "logo"
            }
        }
        const sendRequest = await blockchainApiService.createSendRequest(request);

        // fetch created send request
        const fetchedSendRequest = await blockchainApiService.getSendRequestById(sendRequest.id);

        expect(fetchedSendRequest.id).to.be.equal(sendRequest.id);
        expect(fetchedSendRequest.status).to.be.equal("PENDING");
        expect(fetchedSendRequest.chain_id).to.be.equal(chainId);
        expect(fetchedSendRequest.token_address).to.be.equal(tokenAddress);
        expect(fetchedSendRequest.amount).to.be.equal(amount);
        expect(fetchedSendRequest.sender_address).to.be.null;
        expect(fetchedSendRequest.recipient_address).to.be.equal(recipientAddress);
        expect(fetchedSendRequest.arbitrary_data).to.be.deep.equal(request.arbitrary_data);
        expect(fetchedSendRequest.screen_config).to.be.deep.equal(request.screen_config);
        expect(fetchedSendRequest.redirect_url).to.be.equal(redirectUrlBase + sendRequest.id);
        expect(fetchedSendRequest.send_tx.tx_hash).to.be.null;
        expect(fetchedSendRequest.send_tx.from).to.be.null;
        expect(fetchedSendRequest.send_tx.to).to.be.equal(tokenAddress);
        expect(fetchedSendRequest.send_tx.data).to.not.be.null;
        expect(fetchedSendRequest.send_tx.block_confirmations).to.be.null;

        // send funds
        const sender = testData.frank;
        const senderAddress = (await sender.getAddress()).toLowerCase();
        await testData.stablecoin.transfer(senderAddress, amount);

        const tx = await sender.sendTransaction({
            from: senderAddress,
            to: fetchedSendRequest.send_tx.to,
            data: fetchedSendRequest.send_tx.data
        });
        const txHash = tx.hash.toLowerCase();

        // attach tx hash
        await blockchainApiService.attachTransactionHash(sendRequest.id, txHash);

        // fetch send request and check if it is successful
        const successfulSendRequest = await blockchainApiService.getSendRequestById(sendRequest.id);

        expect(successfulSendRequest.id).to.be.equal(sendRequest.id);
        expect(successfulSendRequest.status).to.be.equal("SUCCESS");
        expect(successfulSendRequest.chain_id).to.be.equal(chainId);
        expect(successfulSendRequest.token_address).to.be.equal(tokenAddress);
        expect(successfulSendRequest.amount).to.be.equal(amount);
        expect(successfulSendRequest.sender_address).to.be.null;
        expect(successfulSendRequest.recipient_address).to.be.equal(recipientAddress);
        expect(successfulSendRequest.arbitrary_data).to.be.deep.equal(request.arbitrary_data);
        expect(successfulSendRequest.screen_config).to.be.deep.equal(request.screen_config);
        expect(successfulSendRequest.redirect_url).to.be.equal(redirectUrlBase + sendRequest.id);
        expect(successfulSendRequest.send_tx.tx_hash).to.be.equal(txHash);
        expect(successfulSendRequest.send_tx.from).to.be.equal(senderAddress);
        expect(successfulSendRequest.send_tx.to).to.be.equal(tokenAddress);
        expect(successfulSendRequest.send_tx.data).to.not.be.null;
        expect(successfulSendRequest.send_tx.block_confirmations).to.not.be.null;

        // check that funds were correctly sent
        const receivedAmount = await testData.stablecoin.balanceOf(recipientAddress);
        expect(receivedAmount).to.be.equal(amount);
    });

    it("Should create send request with clientId and attach wrong transaction hash (❌)", async function () {
        // insert client info into database
        const clientId = "test-client-id";
        const chainId = await testData.frank.getChainId();
        const redirectUrlBase = "https://example.com/";
        const redirectUrl = redirectUrlBase + "${id}";
        const tokenAddress = testData.stablecoin.address.toLowerCase();
        await db.insertClientInfo(clientId, {
            chainId: chainId,
            tokenAddress: tokenAddress,
            sendRedirectUrl: redirectUrl
        });

        // create send request
        const recipientAddress = (await testData.alice.getAddress()).toLocaleLowerCase();
        const amount = "1000";
        const request: CreateSendRequest = {
            client_id: clientId,
            amount: amount,
            recipient_address: recipientAddress,
            arbitrary_data: {
                test_data: true
            },
            screen_config: {
                title: "title",
                message: "message",
                logo: "logo"
            }
        }
        const sendRequest = await blockchainApiService.createSendRequest(request);

        // fetch created send request
        const fetchedSendRequest = await blockchainApiService.getSendRequestById(sendRequest.id);

        expect(fetchedSendRequest.id).to.be.equal(sendRequest.id);
        expect(fetchedSendRequest.status).to.be.equal("PENDING");
        expect(fetchedSendRequest.chain_id).to.be.equal(chainId);
        expect(fetchedSendRequest.token_address).to.be.equal(tokenAddress);
        expect(fetchedSendRequest.amount).to.be.equal(amount);
        expect(fetchedSendRequest.sender_address).to.be.null;
        expect(fetchedSendRequest.recipient_address).to.be.equal(recipientAddress);
        expect(fetchedSendRequest.arbitrary_data).to.be.deep.equal(request.arbitrary_data);
        expect(fetchedSendRequest.screen_config).to.be.deep.equal(request.screen_config);
        expect(fetchedSendRequest.redirect_url).to.be.equal(redirectUrlBase + sendRequest.id);
        expect(fetchedSendRequest.send_tx.tx_hash).to.be.null;
        expect(fetchedSendRequest.send_tx.from).to.be.null;
        expect(fetchedSendRequest.send_tx.to).to.be.equal(tokenAddress);
        expect(fetchedSendRequest.send_tx.data).to.not.be.null;
        expect(fetchedSendRequest.send_tx.block_confirmations).to.be.null;

        // send ether
        const sender = testData.frank;
        const senderAddress = (await sender.getAddress()).toLowerCase();

        const tx = await sender.sendTransaction({
            from: senderAddress,
            to: recipientAddress,
            value: "0x1"
        });
        const txHash = tx.hash.toLowerCase();

        // attach tx hash
        await blockchainApiService.attachTransactionHash(sendRequest.id, txHash);

        // fetch send request and check if it is successful
        const failedSendRequest = await blockchainApiService.getSendRequestById(sendRequest.id);

        expect(failedSendRequest.id).to.be.equal(sendRequest.id);
        expect(failedSendRequest.status).to.be.equal("FAILED");
        expect(failedSendRequest.chain_id).to.be.equal(chainId);
        expect(failedSendRequest.token_address).to.be.equal(tokenAddress);
        expect(failedSendRequest.amount).to.be.equal(amount);
        expect(failedSendRequest.sender_address).to.be.null;
        expect(failedSendRequest.recipient_address).to.be.equal(recipientAddress);
        expect(failedSendRequest.arbitrary_data).to.be.deep.equal(request.arbitrary_data);
        expect(failedSendRequest.screen_config).to.be.deep.equal(request.screen_config);
        expect(failedSendRequest.redirect_url).to.be.equal(redirectUrlBase + sendRequest.id);
        expect(failedSendRequest.send_tx.tx_hash).to.be.equal(txHash);
        expect(failedSendRequest.send_tx.from).to.be.equal(senderAddress);
        expect(failedSendRequest.send_tx.to).to.be.equal(tokenAddress);
        expect(failedSendRequest.send_tx.data).to.not.be.null;
        expect(failedSendRequest.send_tx.block_confirmations).to.not.be.null;
    });

    it("Should create send request with clientId and send funds to wrong address (❌)", async function () {
        // insert client info into database
        const clientId = "test-client-id";
        const chainId = await testData.frank.getChainId();
        const redirectUrlBase = "https://example.com/";
        const redirectUrl = redirectUrlBase + "${id}";
        const tokenAddress = "0x000000000000000000000000000000000000000a";
        await db.insertClientInfo(clientId, {
            chainId: chainId,
            tokenAddress: tokenAddress,
            sendRedirectUrl: redirectUrl
        });

        // create send request
        const recipientAddress = (await testData.alice.getAddress()).toLocaleLowerCase();
        const amount = "1000";
        const request: CreateSendRequest = {
            client_id: clientId,
            amount: amount,
            recipient_address: recipientAddress,
            arbitrary_data: {
                test_data: true
            },
            screen_config: {
                title: "title",
                message: "message",
                logo: "logo"
            }
        }
        const sendRequest = await blockchainApiService.createSendRequest(request);

        // fetch created send request
        const fetchedSendRequest = await blockchainApiService.getSendRequestById(sendRequest.id);

        expect(fetchedSendRequest.id).to.be.equal(sendRequest.id);
        expect(fetchedSendRequest.status).to.be.equal("PENDING");
        expect(fetchedSendRequest.chain_id).to.be.equal(chainId);
        expect(fetchedSendRequest.token_address).to.be.equal(tokenAddress);
        expect(fetchedSendRequest.amount).to.be.equal(amount);
        expect(fetchedSendRequest.sender_address).to.be.null;
        expect(fetchedSendRequest.recipient_address).to.be.equal(recipientAddress);
        expect(fetchedSendRequest.arbitrary_data).to.be.deep.equal(request.arbitrary_data);
        expect(fetchedSendRequest.screen_config).to.be.deep.equal(request.screen_config);
        expect(fetchedSendRequest.redirect_url).to.be.equal(redirectUrlBase + sendRequest.id);
        expect(fetchedSendRequest.send_tx.tx_hash).to.be.null;
        expect(fetchedSendRequest.send_tx.from).to.be.null;
        expect(fetchedSendRequest.send_tx.to).to.be.equal(tokenAddress);
        expect(fetchedSendRequest.send_tx.data).to.not.be.null;
        expect(fetchedSendRequest.send_tx.block_confirmations).to.be.null;

        // send funds
        const sender = testData.frank;
        const senderAddress = (await sender.getAddress()).toLowerCase();
        await testData.stablecoin.transfer(senderAddress, amount);

        const tx = await sender.sendTransaction({
            from: senderAddress,
            to: testData.stablecoin.address,
            data: fetchedSendRequest.send_tx.data
        });
        const txHash = tx.hash.toLowerCase();

        // attach tx hash
        await blockchainApiService.attachTransactionHash(sendRequest.id, txHash);

        // fetch send request and check if it is successful
        const failedSendRequest = await blockchainApiService.getSendRequestById(sendRequest.id);

        expect(failedSendRequest.id).to.be.equal(sendRequest.id);
        expect(failedSendRequest.status).to.be.equal("FAILED");
        expect(failedSendRequest.chain_id).to.be.equal(chainId);
        expect(failedSendRequest.token_address).to.be.equal(tokenAddress);
        expect(failedSendRequest.amount).to.be.equal(amount);
        expect(failedSendRequest.sender_address).to.be.null;
        expect(failedSendRequest.recipient_address).to.be.equal(recipientAddress);
        expect(failedSendRequest.arbitrary_data).to.be.deep.equal(request.arbitrary_data);
        expect(failedSendRequest.screen_config).to.be.deep.equal(request.screen_config);
        expect(failedSendRequest.redirect_url).to.be.equal(redirectUrlBase + sendRequest.id);
        expect(failedSendRequest.send_tx.tx_hash).to.be.equal(txHash);
        expect(failedSendRequest.send_tx.from).to.be.equal(senderAddress);
        expect(failedSendRequest.send_tx.to).to.be.equal(tokenAddress);
        expect(failedSendRequest.send_tx.data).to.not.be.null;
        expect(failedSendRequest.send_tx.block_confirmations).to.not.be.null;
    });

    it("Should create send request with clientId and send funds from wrong address (❌)", async function () {
        // insert client info into database
        const clientId = "test-client-id";
        const chainId = await testData.frank.getChainId();
        const redirectUrlBase = "https://example.com/";
        const redirectUrl = redirectUrlBase + "${id}";
        const tokenAddress = testData.stablecoin.address.toLowerCase();
        await db.insertClientInfo(clientId, {
            chainId: chainId,
            tokenAddress: tokenAddress,
            sendRedirectUrl: redirectUrl
        });

        const sender = testData.frank;
        const senderAddress = (await sender.getAddress()).toLowerCase();

        // create send request
        const recipientAddress = (await testData.alice.getAddress()).toLocaleLowerCase();
        const amount = "1000";
        const request: CreateSendRequest = {
            client_id: clientId,
            amount: amount,
            sender_address: senderAddress,
            recipient_address: recipientAddress,
            arbitrary_data: {
                test_data: true
            },
            screen_config: {
                title: "title",
                message: "message",
                logo: "logo"
            }
        }
        const sendRequest = await blockchainApiService.createSendRequest(request);

        // fetch created send request
        const fetchedSendRequest = await blockchainApiService.getSendRequestById(sendRequest.id);

        expect(fetchedSendRequest.id).to.be.equal(sendRequest.id);
        expect(fetchedSendRequest.status).to.be.equal("PENDING");
        expect(fetchedSendRequest.chain_id).to.be.equal(chainId);
        expect(fetchedSendRequest.token_address).to.be.equal(tokenAddress);
        expect(fetchedSendRequest.amount).to.be.equal(amount);
        expect(fetchedSendRequest.sender_address).to.be.equal(senderAddress);
        expect(fetchedSendRequest.recipient_address).to.be.equal(recipientAddress);
        expect(fetchedSendRequest.arbitrary_data).to.be.deep.equal(request.arbitrary_data);
        expect(fetchedSendRequest.screen_config).to.be.deep.equal(request.screen_config);
        expect(fetchedSendRequest.redirect_url).to.be.equal(redirectUrlBase + sendRequest.id);
        expect(fetchedSendRequest.send_tx.tx_hash).to.be.null;
        expect(fetchedSendRequest.send_tx.from).to.be.null;
        expect(fetchedSendRequest.send_tx.to).to.be.equal(tokenAddress);
        expect(fetchedSendRequest.send_tx.data).to.not.be.null;
        expect(fetchedSendRequest.send_tx.block_confirmations).to.be.null;

        // send funds
        const otherSender = testData.jane;
        const otherSenderAddress = (await otherSender.getAddress()).toLowerCase();
        await testData.stablecoin.transfer(otherSenderAddress, amount);

        const tx = await otherSender.sendTransaction({
            from: otherSenderAddress,
            to: fetchedSendRequest.send_tx.to,
            data: fetchedSendRequest.send_tx.data
        });
        const txHash = tx.hash.toLowerCase();

        // attach tx hash
        await blockchainApiService.attachTransactionHash(sendRequest.id, txHash);

        // fetch send request and check if it is successful
        const failedSendRequest = await blockchainApiService.getSendRequestById(sendRequest.id);

        expect(failedSendRequest.id).to.be.equal(sendRequest.id);
        expect(failedSendRequest.status).to.be.equal("FAILED");
        expect(failedSendRequest.chain_id).to.be.equal(chainId);
        expect(failedSendRequest.token_address).to.be.equal(tokenAddress);
        expect(failedSendRequest.amount).to.be.equal(amount);
        expect(failedSendRequest.sender_address).to.be.equal(senderAddress);
        expect(failedSendRequest.recipient_address).to.be.equal(recipientAddress);
        expect(failedSendRequest.arbitrary_data).to.be.deep.equal(request.arbitrary_data);
        expect(failedSendRequest.screen_config).to.be.deep.equal(request.screen_config);
        expect(failedSendRequest.redirect_url).to.be.equal(redirectUrlBase + sendRequest.id);
        expect(failedSendRequest.send_tx.tx_hash).to.be.equal(txHash);
        expect(failedSendRequest.send_tx.from).to.be.equal(otherSenderAddress);
        expect(failedSendRequest.send_tx.to).to.be.equal(tokenAddress);
        expect(failedSendRequest.send_tx.data).to.not.be.null;
        expect(failedSendRequest.send_tx.block_confirmations).to.not.be.null;
    });
})
