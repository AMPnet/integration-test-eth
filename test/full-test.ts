// @ts-ignore
import {ethers} from "hardhat";
import {Signer} from "ethers";
import {expect} from "chai";
import * as helpers from "../tokenizer-prototype/util/helpers";
import {after, it} from "mocha";
import * as docker from "../util/docker";
import * as userService from "../util/user-service";
import * as reportService from "../util/report-service";
import * as db from "../util/db";
import {DockerEnv} from "../util/types";
import {TestData} from "../tokenizer-prototype/test/TestData";

describe("Full flow test", function () {

    const testData = new TestData()

    before(async function () {
        await docker.network.create();
        await docker.hardhat.up();
        await testData.deploy();
        const dockerEnv: DockerEnv = {
            WALLET_APPROVER_ADDRESS: testData.walletApproverService.address,
            FAUCET_SERVICE_ADDRESS: testData.faucetService.address,
            AUTO_INVEST_SERVICE_ADDRESS: testData.investService.address,
            CF_MANAGER_FACTORY_ADDRESS_0: testData.cfManagerFactory.address,
            SNAPSHOT_DISTRIBUTOR_ADDRESS_0: "" // TODO: use payout manager
        };
        await docker.backend.up(dockerEnv);
    });

    beforeEach(async function () {
        await db.clearDb();
        await docker.hardhat.restart();
        await testData.deploy();
    });

    after(async function () {
        await docker.backend.down();
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
        // TODO: checkout problem with events
        // expect(await txHistory?.data.transactions.length).is.equal(3)
    });

    it("Should only send faucet funds to accounts below faucet threshold", async function () {
        const fundedAddresses = [(testData.alice)]
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

        const ethReward = ethers.utils.parseEther(testData.faucetReward)

        const initialBalance = ethers.utils.parseEther("10000")
        // check wallet balances of funded addresses
        for (const signer of fundedAddresses) {
            expect(await ethers.provider.getBalance(await signer.getAddress())).not.to.be.equal(initialBalance)
        }

        // check wallet balances of non-funded addresses
        for (const signer of nonFundedAddresses) {
            expect(await ethers.provider.getBalance(await signer.getAddress())).to.be.equal(initialBalance)
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
        const numberOfTaks = Number((await db.countBlockchainTasks()).rows[0].count)
        expect(numberOfTaks).to.be.below(5, "Too many blockchain tasks for whitelisting")
    });

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
})
