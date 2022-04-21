// @ts-ignore
import {ethers} from "hardhat";
import {Signer} from "ethers";
import {expect} from "chai";
import * as helpers from "../tokenizer-prototype/util/helpers";
import {after, it} from "mocha";
import * as docker from "../util/docker";
import * as userService from "../util/user-service";
import * as reportService from "../util/report-service";
import * as payoutService from "../util/payout-service";
import * as blockchainApiService from "../util/blockchain-api-service";
import * as db from "../util/db";
import {DockerEnv} from "../util/types";
import {TestData} from "../tokenizer-prototype/test/TestData";
import {InvestorPayoutsResponse, SnapshotResponse} from "../util/payout-service";
import {CreateSendRequest} from "../util/blockchain-api-service";

describe("Full flow test", function () {

    let testData!: TestData

    before(async function () {
        await docker.network.create();
        await docker.hardhat.up();
    });

    beforeEach(async function () {
        testData = new TestData();
        await testData.deploy();
        const dockerEnv: DockerEnv = {
            WALLET_APPROVER_ADDRESS: testData.walletApproverService.address,
            FAUCET_SERVICE_ADDRESS: testData.faucetService.address,
            AUTO_INVEST_SERVICE_ADDRESS: testData.investService.address,
            CF_MANAGER_FACTORY_ADDRESS_0: testData.cfManagerFactory.address,
            CF_MANAGER_FACTORY_ADDRESS_1: testData.cfManagerVestingFactory.address,
            // TODO: remove after updating report-service to use payout manager
            SNAPSHOT_DISTRIBUTOR_ADDRESS_0: testData.cfManagerVestingFactory.address
        };
        await docker.backend.up(dockerEnv);
        await db.clearDb();
    });

    afterEach(async function () {
        await docker.backend.down();
    });

    after(async function () {
        await docker.hardhat.down();
        await docker.network.remove();
    });

    it("Should whitelist user and get tx history", async function () {
        await testData.deployIssuerAssetTransferableCampaign({campaignWhitelistRequired: true});

        const franksAddress = await testData.frank.getAddress()
        const payload = await userService.getPayload(franksAddress)
        const franksAccessToken = await userService.getAccessToken(
          franksAddress, await testData.frank.signMessage(payload)
        )
        await userService.completeKyc(franksAccessToken, franksAddress)
        await userService.whitelistAddress(
          franksAccessToken,
          testData.issuer.address,
          await testData.frank.getChainId()
        )

        await new Promise(f => setTimeout(f, 5000))
        const isWalletApproved = await testData.issuer.isWalletApproved(franksAddress)
        expect(isWalletApproved).to.be.true

        // Generate xlsx report
        const issuerOwnerAddress = await testData.issuerOwner.getAddress()
        const adminsPayload = await userService.getPayload(issuerOwnerAddress)
        const adminsAccessToken = await userService
            .getAccessToken(issuerOwnerAddress, await testData.issuerOwner.signMessage(adminsPayload))
        const xlsxReport = await reportService
            .getXlsxReport(adminsAccessToken, testData.issuer.address, await testData.issuerOwner.getChainId())
        expect(xlsxReport?.status).to.equal(200)

        //// Frank buys $100k USDC and goes through kyc process (wallet approved)
        const franksInvestment = 100000
        const franksInvestmentWei = ethers.utils.parseUnits(franksInvestment.toString(), "6")
        await testData.stablecoin.transfer(franksAddress, franksInvestmentWei)

        //// Frank invests $100k USDC in the project and then cancels her/his investment and then invests again
        await helpers.invest(testData.frank, testData.cfManager, testData.stablecoin, franksInvestment)
        await helpers.cancelInvest(testData.frank, testData.cfManager)
        await helpers.invest(testData.frank, testData.cfManager, testData.stablecoin, franksInvestment)

        // Add additional blockchain transaction
        await testData.stablecoin.transfer(await testData.jane.getAddress(), franksInvestmentWei)

        // Get transaction history
        await new Promise(f => setTimeout(f, 2000))
        const txHistory = await reportService
            .getTxHistory(franksAccessToken, testData.issuer.address, await testData.issuerOwner.getChainId())
        expect(await txHistory?.data.transactions.length).is.equal(3)
    });

    it("Should only send faucet funds to accounts below faucet threshold", async function () {
        const fundedAddresses = [testData.alice]
        await testData.alice.sendTransaction({
            to: testData.faucetService.address,
            value: ethers.utils.parseEther("9999.0000076")
        })

        // existing accounts are already funded and therefore above faucet threshold
        const nonFundedAddresses = [
            testData.jane,
            testData.frank,
            testData.mark
        ]

        // store initial funded account balances - used for compatibility when running together with all tests
        const initialBalances = {}
        for (const signer of nonFundedAddresses) {
            const address = await signer.getAddress()
            initialBalances[address] = await ethers.provider.getBalance(address)
        }

        const allAddresses = [...fundedAddresses, ...nonFundedAddresses]
        const chainId = await testData.walletApprover.getChainId()

        // request faucet funds for each account
        for (let signer of allAddresses) {
            const address = await signer.getAddress()
            const payload = await userService.getPayload(address)
            const token = await userService.getAccessToken(
                address, await signer.signMessage(payload)
            )
            await userService.requestFaucetFunds(token, chainId)
        }

        // wait for faucet funds to be sent
        await new Promise(f => setTimeout(f, 5000))

        const initialBalance = ethers.utils.parseEther("10000")
        // check wallet balances of funded addresses
        for (const signer of fundedAddresses) {
            expect(await ethers.provider.getBalance(await signer.getAddress())).not.to.be.equal(initialBalance)
        }

        // check wallet balances of non-funded addresses
        for (const signer of nonFundedAddresses) {
            const address = await signer.getAddress()
            expect(await ethers.provider.getBalance(address)).to.be.equal(initialBalances[address])
        }
    });

    it("Should auto-invest for campaign without KYC after user receives funds", async function () {
        await testData.deployIssuerAssetTransferableCampaign({campaignWhitelistRequired: false});

        const franksAddress = await testData.frank.getAddress()
        const payload = await userService.getPayload(franksAddress)
        const franksAccessToken = await userService.getAccessToken(
          franksAddress,
          await testData.frank.signMessage(payload)
        )

        //// Frank reserves $100k USDC for investment
        const franksInvestment = 100000
        const franksInvestmentWei = ethers.utils.parseUnits(franksInvestment.toString(), "6")
        const chainId = await testData.frank.getChainId()

        await testData.stablecoin.connect(testData.frank).approve(testData.cfManager.address, franksInvestmentWei)

        // Frank request auto-invest
        await userService.autoInvest(
          franksAccessToken,
          testData.cfManager.address,
          franksInvestmentWei.toString(),
          chainId
        )

        // auto-invest should not be triggered yet
        await new Promise(f => setTimeout(f, 5000))
        expect(await testData.cfManager.investmentAmount(franksAddress)).to.be.equal(ethers.utils.parseEther("0"))

        //// Frank buys $100k USDC
        await testData.stablecoin.transfer(franksAddress, franksInvestmentWei)

        // auto-invest should be completed after this
        await new Promise(f => setTimeout(f, 5000))

        // Frank should have an investment after auto-invest has been completed
        expect(await testData.cfManager.investmentAmount(franksAddress)).to.be.equal(franksInvestmentWei)
    });

    it(
    ` Should auto-invest for campaign with KYC after user is whitelisted and receives funds.
        Test covers following 4 scenarios:
            1) approve amount slightly above the funds available at the wallet (✅)
            2) approve amount exactly equal to the funds available at the wallet (✅)
            3) approve amount slightly below the funds available at the wallet (✅)
            4) approve amount equal to the minPerUserInvestment but the funds available slightly below this level (❌)
    `, async function () {
        await testData.deployIssuerAssetTransferableCampaign({campaignWhitelistRequired: true});

        const franksAddress = await testData.frank.getAddress()
        const payload = await userService.getPayload(franksAddress)
        const franksAccessToken = await userService.getAccessToken(
          franksAddress,
          await testData.frank.signMessage(payload)
        )
        const balanceOffset = 1000000; // 1$ offset between allowance and the actual funds owned
        const chainId = await testData.frank.getChainId()
        const deadAddress = "0x000000000000000000000000000000000000dEaD";

        /***** CASE 1: START *****/

        // Frank reserves $100k USDC for investment
        const franksInvestmentCase1 = 100000
        const franksInvestmentCase1Wei = ethers.utils.parseUnits(franksInvestmentCase1.toString(), "6")
        const franksApprovalCase1Wei = franksInvestmentCase1Wei.add(balanceOffset);

        await testData.stablecoin.connect(testData.frank).approve(testData.cfManager.address, franksApprovalCase1Wei)

        // Frank request auto-invest
        await userService.autoInvest(
          franksAccessToken,
          testData.cfManager.address,
          franksApprovalCase1Wei.toString(),
          chainId
        )

        // auto-invest should not be triggered yet
        await new Promise(f => setTimeout(f, 5000))
        expect(await testData.cfManager.investmentAmount(franksAddress)).to.be.equal(ethers.utils.parseEther("0"))

        //// Frank buys $100k USDC
        await testData.stablecoin.transfer(franksAddress, franksInvestmentCase1Wei)

        // auto-invest should not be completed after this - still needs whitelisting
        await new Promise(f => setTimeout(f, 5000))

        // whitelist Frank's wallet
        await userService.completeKyc(franksAccessToken, franksAddress)
        await userService.whitelistAddress(
          franksAccessToken,
          testData.issuer.address,
          await testData.frank.getChainId()
        )

        await new Promise(f => setTimeout(f, 5000))
        const isWalletApproved = await testData.issuer.isWalletApproved(franksAddress)
        expect(isWalletApproved).to.be.true

        // auto-invest should be completed after this
        await new Promise(f => setTimeout(f, 5000))

        expect(await testData.cfManager.investmentAmount(franksAddress)).to.be.equal(franksInvestmentCase1Wei)
        
        // cancel investment and burn all of the frank funds returned from the campaign
        await testData.cfManager.connect(testData.frank).cancelInvestment();
        await testData.stablecoin.connect(testData.frank).transfer(
            deadAddress,
            await testData.stablecoin.balanceOf(franksAddress)
        );

        /***** CASE 1: END *****/


        /***** CASE 2: START *****/

        //// Frank reserves $100k USDC for investment
        const franksInvestmentCase2 = 100000
        const franksInvestmentCase2Wei = ethers.utils.parseUnits(franksInvestmentCase2.toString(), "6")

        await testData.stablecoin.connect(testData.frank).approve(testData.cfManager.address, franksInvestmentCase2Wei)

        // Frank request auto-invest
        await userService.autoInvest(
          franksAccessToken,
          testData.cfManager.address,
          franksInvestmentCase2Wei.toString(),
          chainId
        )

        // auto-invest should not be triggered yet
        await new Promise(f => setTimeout(f, 5000))
        expect(await testData.cfManager.investmentAmount(franksAddress)).to.be.equal(ethers.utils.parseEther("0"))

        //// Frank buys $100k USDC
        await testData.stablecoin.transfer(franksAddress, franksInvestmentCase2Wei)
        
        // auto-invest should be completed after this
        await new Promise(f => setTimeout(f, 5000))

        expect(await testData.cfManager.investmentAmount(franksAddress)).to.be.equal(franksInvestmentCase2Wei)
        
        // cancel investment and burn all of the frank funds returned from the campaign
        await testData.cfManager.connect(testData.frank).cancelInvestment();
        await testData.stablecoin.connect(testData.frank).transfer(
            deadAddress,
            await testData.stablecoin.balanceOf(franksAddress)
        );

        /***** CASE 2: END *****/


        /***** CASE 3: START *****/
        
        //// Frank reserves $100k USDC for investment
        const franksInvestmentCase3 = 100000
        const franksInvestmentCase3Wei = ethers.utils.parseUnits(franksInvestmentCase3.toString(), "6")
        const franksApprovalCase3Wei = franksInvestmentCase3Wei.sub(balanceOffset);

        await testData.stablecoin.connect(testData.frank).approve(testData.cfManager.address, franksApprovalCase3Wei)

        // Frank request auto-invest
        await userService.autoInvest(
          franksAccessToken,
          testData.cfManager.address,
          franksApprovalCase3Wei.toString(),
          chainId
        )

        // auto-invest should not be triggered yet
        await new Promise(f => setTimeout(f, 5000))
        expect(await testData.cfManager.investmentAmount(franksAddress)).to.be.equal(ethers.utils.parseEther("0"))

        //// Frank buys $100k USDC
        await testData.stablecoin.transfer(franksAddress, franksInvestmentCase3Wei)
        
        // auto-invest should be completed after this
        await new Promise(f => setTimeout(f, 5000))

        expect(await testData.cfManager.investmentAmount(franksAddress)).to.be.equal(franksApprovalCase3Wei)
        
        // cancel investment and burn all of the frank funds returned from the campaign
        await testData.cfManager.connect(testData.frank).cancelInvestment();
        await testData.stablecoin.connect(testData.frank).transfer(
            deadAddress,
            await testData.stablecoin.balanceOf(franksAddress)
        );

        /***** CASE 3: END *****/

        
        /***** CASE 4: START *****/
        
        //// Frank reserves $100k USDC for investment
        const franksInvestmentCase4 = 9999  // minPerUserInvestment - 1
        const franksInvestmentCase4Wei = ethers.utils.parseUnits(franksInvestmentCase4.toString(), "6")
        const franksApprovalCase4Wei = 10000; // minPerUserInvestment

        await testData.stablecoin.connect(testData.frank).approve(testData.cfManager.address, franksApprovalCase4Wei)

        // Frank request auto-invest
        await userService.autoInvest(
          franksAccessToken,
          testData.cfManager.address,
          franksApprovalCase4Wei.toString(),
          chainId
        )

        // auto-invest should not be triggered yet
        await new Promise(f => setTimeout(f, 5000))
        expect(await testData.cfManager.investmentAmount(franksAddress)).to.be.equal(ethers.utils.parseEther("0"))

        //// Frank buys $100k USDC
        await testData.stablecoin.transfer(franksAddress, franksInvestmentCase4Wei)
        
        // auto-invest should be completed after this
        await new Promise(f => setTimeout(f, 5000))

        expect(await testData.cfManager.investmentAmount(franksAddress)).to.be.equal(0);
        const numberOfAutoInvestTasks = Number((await db.countAutoInvestTasks()).rows[0].count)
        expect(numberOfAutoInvestTasks).to.be.equal(0);

        /***** CASE 4: END *****/

    });

    it("Should whitelist multiple users in batch", async function () {
        await testData.deployIssuerAssetTransferableCampaign({campaignWhitelistRequired: true});

        const startAccount = 0;
        const endAccount = 20;
        const accounts: Signer[] = await ethers.getSigners();
        for (let i = startAccount; i < endAccount; i++) {
            await whitelistUser(accounts[i]);
        }

        await new Promise(f => setTimeout(f, 5000));
        for (let i = startAccount; i < endAccount; i++) {
            const address = await accounts[i].getAddress()
            console.log("Checking address: ", address)
            const isWalletApproved = await testData.issuer.isWalletApproved(address)
            expect(isWalletApproved).to.be.true
        }
        const numberOfTasks = Number((await db.countBlockchainTasks()).rows[0].count)
        expect(numberOfTasks).to.be.below(
          5,
          `Too many blockchain tasks for whitelisting: ${numberOfTasks} should be < 5`
        )
    });

    it("Should create payout for some asset and allow users to claim funds", async function () {
        await testData.deployIssuerAssetTransferableCampaign({campaignWhitelistRequired: false})

        const alicesAddress = await testData.alice.getAddress()
        const janesAddress = await testData.jane.getAddress()
        const franksAddress = await testData.frank.getAddress()
        const marksAddress = await testData.mark.getAddress()

        // set-up balances for payout
        const alicesInvestment = ethers.utils.parseEther("10000")
        const janesInvestment = ethers.utils.parseEther("15000")
        const franksInvestment = ethers.utils.parseEther("20000")
        await testData.asset.connect(testData.issuerOwner).transfer(alicesAddress, alicesInvestment)
        await testData.asset.connect(testData.issuerOwner).transfer(janesAddress, janesInvestment)
        await testData.asset.connect(testData.issuerOwner).transfer(franksAddress, franksInvestment)

        const rewardAmount = ethers.utils.parseEther("50000") // two to one for payout (Alice and Jane)

        // store block number for payout
        const payoutBlockNumber = await ethers.provider.getBlockNumber()

        // some additional transfers which should not be included in payout
        await testData.asset.connect(testData.issuerOwner).transfer(marksAddress, ethers.utils.parseEther("1000"))
        await testData.asset.connect(testData.issuerOwner).transfer(alicesAddress, ethers.utils.parseEther("1000"))
        await testData.asset.connect(testData.issuerOwner).transfer(janesAddress, ethers.utils.parseEther("1000"))
        await testData.asset.connect(testData.issuerOwner).transfer(franksAddress, ethers.utils.parseEther("1000"))

        const chainId = await testData.alice.getChainId()

        // create token for deployer
        const issuerOwnerAddress = await testData.issuerOwner.getAddress()
        const issuerOwnerAccessToken = await getAccessToken(testData.issuerOwner as Signer)

        const ignoredAddresses = [issuerOwnerAddress, franksAddress, testData.cfManager.address]

        await setupWeb3jFilter()

        const snapshotName = "snapshot-name"

        // request payout tree creation
        const snapshotResponse = await payoutService.createSnapshot(
          issuerOwnerAccessToken,
          snapshotName,
          chainId,
          testData.asset.address,
          payoutBlockNumber,
          ignoredAddresses
        )

        // wait for payout tree to be created
        let snapshot: SnapshotResponse
        let maxRetries = 10
        do {
            await new Promise(f => setTimeout(f, 5000))
            snapshot = await payoutService.getSnapshotById(
              issuerOwnerAccessToken,
              snapshotResponse.id
            )
            maxRetries -= 1
        } while (snapshot.status != "SUCCESS" && maxRetries > 0)

        const rewardCoin = await helpers.deployStablecoin(testData.issuerOwner, "1000000000000", 18)

        // approve reward for payout
        await rewardCoin.connect(testData.issuerOwner).approve(testData.payoutManager.address, rewardAmount)

        // create payout on blockchain
        await testData.payoutManager.connect(testData.issuerOwner).createPayout(
          {
              asset: testData.asset.address,
              totalAssetAmount: snapshot.total_asset_amount,
              ignoredHolderAddresses: snapshot.ignored_holder_addresses,
              payoutInfo: snapshot.name,
              assetSnapshotMerkleRoot: snapshot.asset_snapshot_merkle_root,
              assetSnapshotMerkleDepth: snapshot.asset_snapshot_merkle_depth,
              assetSnapshotBlockNumber: snapshot.asset_snapshot_block_number,
              assetSnapshotMerkleIpfsHash: snapshot.asset_snapshot_merkle_ipfs_hash,
              rewardAsset: rewardCoin.address,
              totalRewardAmount: rewardAmount
          }
        )

        // verify payout info
        const payoutInfo = await testData.payoutManager.getPayoutInfo(0)
        expect(payoutInfo.payoutId).to.be.equal(0)
        expect(payoutInfo.payoutOwner).to.be.equal(issuerOwnerAddress)
        expect(payoutInfo.payoutInfo).to.be.equal(snapshotName)
        expect(payoutInfo.isCanceled).to.be.equal(false)
        expect(payoutInfo.asset).to.be.equal(testData.asset.address)
        expect(payoutInfo.totalAssetAmount).to.be.equal(snapshot.total_asset_amount)
        expect(payoutInfo.ignoredHolderAddresses).to.have.members(ignoredAddresses)
        expect(payoutInfo.assetSnapshotMerkleRoot).to.be.equal(snapshot.asset_snapshot_merkle_root)
        expect(payoutInfo.assetSnapshotMerkleDepth).to.be.equal(snapshot.asset_snapshot_merkle_depth)
        expect(payoutInfo.assetSnapshotBlockNumber).to.be.equal(snapshot.asset_snapshot_block_number)
        expect(payoutInfo.assetSnapshotMerkleIpfsHash).to.be.equal(snapshot.asset_snapshot_merkle_ipfs_hash)
        expect(payoutInfo.rewardAsset).to.be.equal(rewardCoin.address)
        expect(payoutInfo.totalRewardAmount).to.be.equal(rewardAmount)
        expect(payoutInfo.remainingRewardAmount).to.be.equal(rewardAmount)

        const assetFactories = [
            testData.assetFactory.address,
            testData.assetSimpleFactory.address,
            testData.assetTransferableFactory.address
        ]

        // get path, claim funds for Alice and verify they are received
        const alicesAccessToken = await getAccessToken(testData.alice as Signer)
        const alicesPayouts = await payoutService.getPayoutsForInvestor(
          alicesAccessToken,
          chainId,
          assetFactories,
          testData.payoutService.address,
          testData.payoutManager.address,
          testData.issuer.address
        ) as InvestorPayoutsResponse

        expect(alicesPayouts.claimable_payouts.length).to.be.equal(1)

        await testData.payoutManager.connect(testData.alice).claim(
          payoutInfo.payoutId,
          alicesPayouts.claimable_payouts[0].investor,
          alicesPayouts.claimable_payouts[0].balance,
          alicesPayouts.claimable_payouts[0].proof
        )

        const alicesRewardBalance = await rewardCoin.balanceOf(alicesAddress)
        expect(alicesRewardBalance).to.be.equal(alicesInvestment.mul(2))

        // get path, claim funds for Jane and verify they are received
        const janesAccessToken = await getAccessToken(testData.jane as Signer)
        const janesPayouts = await payoutService.getPayoutsForInvestor(
          janesAccessToken,
          chainId,
          assetFactories,
          testData.payoutService.address,
          testData.payoutManager.address,
          testData.issuer.address
        ) as InvestorPayoutsResponse

        expect(janesPayouts.claimable_payouts.length).to.be.equal(1)

        await testData.payoutManager.connect(testData.jane).claim(
          payoutInfo.payoutId,
          janesPayouts.claimable_payouts[0].investor,
          janesPayouts.claimable_payouts[0].balance,
          janesPayouts.claimable_payouts[0].proof
        )

        const janesRewardBalance = await rewardCoin.balanceOf(janesAddress)
        expect(janesRewardBalance).to.be.equal(janesInvestment.mul(2))

        // Frank's address was ignored while creating payout
        const franksAccessToken = await getAccessToken(testData.frank as Signer)
        const franksPayouts = await payoutService.getPayoutsForInvestor(
          franksAccessToken,
          chainId,
          assetFactories,
          testData.payoutService.address,
          testData.payoutManager.address,
          testData.issuer.address
        ) as InvestorPayoutsResponse

        expect(franksPayouts.claimable_payouts.length).to.be.equal(0)

        // Mark got funds after payout was created, address is not included in payout
        const marksAccessToken = await getAccessToken(testData.mark as Signer)
        const marksPayouts = await payoutService.getPayoutsForInvestor(
          marksAccessToken,
          chainId,
          assetFactories,
          testData.payoutService.address,
          testData.payoutManager.address,
          testData.issuer.address
        ) as InvestorPayoutsResponse

        expect(marksPayouts.claimable_payouts.length).to.be.equal(0)
    });

    it("Should create send request with clientId and correctly send funds (✅)", async function () {
        // insert client info into database
        const clientId = "test-client-id";
        const chainId = await testData.frank.getChainId();
        const redirectUrlBase = "https://example.com";
        await db.insertClientInfo(clientId, chainId, redirectUrlBase);

        // create send request
        const recipientAddress = (await testData.alice.getAddress()).toLocaleLowerCase();
        const tokenAddress = testData.stablecoin.address.toLowerCase();
        const amount = "1000";
        const request: CreateSendRequest = {
            client_id: clientId,
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
        expect(fetchedSendRequest.redirect_url).to.be.equal(redirectUrlBase + `/send/${sendRequest.id}`);
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
        expect(successfulSendRequest.redirect_url).to.be.equal(redirectUrlBase + `/send/${sendRequest.id}`);
        expect(successfulSendRequest.send_tx.tx_hash).to.be.equal(txHash);
        expect(successfulSendRequest.send_tx.from).to.be.equal(senderAddress);
        expect(successfulSendRequest.send_tx.to).to.be.equal(tokenAddress);
        expect(successfulSendRequest.send_tx.data).to.not.be.null;
        expect(successfulSendRequest.send_tx.block_confirmations).to.not.be.null;

        // check that funds were correctly sent
        const receivedAmount = await testData.stablecoin.balanceOf(recipientAddress);
        expect(receivedAmount).to.be.equal(amount);
    });

    it("Should create send request with chainId and redirectUrl and correctly send funds (✅)", async function () {
        const chainId = await testData.frank.getChainId();
        const redirectUrlBase = "https://example.com";

        // create send request
        const recipientAddress = (await testData.alice.getAddress()).toLocaleLowerCase();
        const tokenAddress = testData.stablecoin.address.toLowerCase();
        const amount = "1000";
        const request: CreateSendRequest = {
            chain_id: chainId,
            redirect_url: redirectUrlBase,
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
        expect(fetchedSendRequest.redirect_url).to.be.equal(redirectUrlBase + `/send/${sendRequest.id}`);
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
        expect(successfulSendRequest.redirect_url).to.be.equal(redirectUrlBase + `/send/${sendRequest.id}`);
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
        const redirectUrlBase = "https://example.com";
        await db.insertClientInfo(clientId, chainId, redirectUrlBase);

        // create send request
        const recipientAddress = (await testData.alice.getAddress()).toLocaleLowerCase();
        const tokenAddress = testData.stablecoin.address.toLowerCase();
        const amount = "1000";
        const request: CreateSendRequest = {
            client_id: clientId,
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
        expect(fetchedSendRequest.redirect_url).to.be.equal(redirectUrlBase + `/send/${sendRequest.id}`);
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
        expect(failedSendRequest.redirect_url).to.be.equal(redirectUrlBase + `/send/${sendRequest.id}`);
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
        const redirectUrlBase = "https://example.com";
        await db.insertClientInfo(clientId, chainId, redirectUrlBase);

        // create send request
        const recipientAddress = (await testData.alice.getAddress()).toLocaleLowerCase();
        const tokenAddress = "0x000000000000000000000000000000000000000a";
        const amount = "1000";
        const request: CreateSendRequest = {
            client_id: clientId,
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
        expect(fetchedSendRequest.redirect_url).to.be.equal(redirectUrlBase + `/send/${sendRequest.id}`);
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
        expect(failedSendRequest.redirect_url).to.be.equal(redirectUrlBase + `/send/${sendRequest.id}`);
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
        const redirectUrlBase = "https://example.com";
        await db.insertClientInfo(clientId, chainId, redirectUrlBase);

        const sender = testData.frank;
        const senderAddress = (await sender.getAddress()).toLowerCase();

        // create send request
        const recipientAddress = (await testData.alice.getAddress()).toLocaleLowerCase();
        const tokenAddress = testData.stablecoin.address.toLowerCase();
        const amount = "1000";
        const request: CreateSendRequest = {
            client_id: clientId,
            token_address: tokenAddress,
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
        expect(fetchedSendRequest.redirect_url).to.be.equal(redirectUrlBase + `/send/${sendRequest.id}`);
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
        expect(failedSendRequest.redirect_url).to.be.equal(redirectUrlBase + `/send/${sendRequest.id}`);
        expect(failedSendRequest.send_tx.tx_hash).to.be.equal(txHash);
        expect(failedSendRequest.send_tx.from).to.be.equal(otherSenderAddress);
        expect(failedSendRequest.send_tx.to).to.be.equal(tokenAddress);
        expect(failedSendRequest.send_tx.data).to.not.be.null;
        expect(failedSendRequest.send_tx.block_confirmations).to.not.be.null;
    });

    async function setupWeb3jFilter() {
        const filter = {
            fromBlock: "0x0",
            toBlock: "0x1",
            address: testData.stablecoin.address
        }

        // needed to make web3j on backend work correctly with hardhat test network
        for (let i = 0; i < 16; i++) {
            await ethers.provider.send("eth_newFilter", [filter])
        }
    }

    async function whitelistUser(user: Signer) {
        const address = await user.getAddress()
        console.log("Whitelisting address: ", address)
        const payload = await userService.getPayload(address)
        const userAccessToken = await userService.getAccessToken(
          address, await user.signMessage(payload)
        )
        await userService.completeKyc(userAccessToken, address)
        await userService.whitelistAddress(
          userAccessToken,
          testData.issuer.address,
          await user.getChainId()
        )
    }

    async function getAccessToken(signer: Signer) {
        const address = await signer.getAddress()
        const payload = await userService.getPayload(address)
        return await userService.getAccessToken(
          address,
          await signer.signMessage(payload)
        )
    }
})
