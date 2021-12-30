// @ts-ignore
import {ethers} from "hardhat";
import {expect} from "chai";
import * as helpers from "../util/helpers";
import {after, it} from "mocha";
import * as docker from "../util/docker";
import * as userService from "../util/user-service";
import * as reportService from "../util/report-service";
import * as db from "../util/db"
import {DockerEnv} from "../util/types";
import {TestData} from "../util/TestData";

describe("Full flow test", function () {

    const testData = new TestData()

    beforeEach(async function () {
        await docker.hardhat.up();
        await testData.setupContracts();
        const dockerEnv: DockerEnv = {
            WALLET_APPROVER_ADDRESS: testData.walletApproverService.address,
            FAUCET_SERVICE_ADDRESS: testData.faucetService.address,
            AUTO_INVEST_SERVICE_ADDRESS: testData.investService.address,
            CF_MANAGER_FACTORY_ADDRESS_0: testData.cfManagerFactory.address,
            SNAPSHOT_DISTRIBUTOR_ADDRESS_0: testData.payoutManagerFactory.address
        };
        await docker.backend.up(dockerEnv);
    });

    it("Should whitelist user and get tx history", async function () {
        await testData.setupIssuerAssetAndCampaign({campaignWhitelistRequired: true});

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
        // send some funds to the faucet contract
        await testData.deployer.sendTransaction({
            to: testData.faucetService.address,
            value: ethers.utils.parseEther("10")
        });

        // generate random user addresses below threshold (zero funds)
        const fundedAddresses = Array.from({length: 10}, () => ethers.Wallet.createRandom().address)

        // existing accounts are already funded and therefore above faucet threshold
        const nonFundedAddresses = [
            await testData.alice.getAddress(),
            await testData.jane.getAddress(),
            await testData.frank.getAddress(),
            await testData.mark.getAddress()
        ]

        const allAddresses = [...fundedAddresses, ...nonFundedAddresses]
        const chainId = await testData.faucetCaller.getChainId()

        // request faucet funds for each account
        for (let address of allAddresses) {
            await userService.requestFaucetFunds(address, chainId)
        }

        // wait for faucet funds to be sent
        await new Promise(f => setTimeout(f, 5000))

        const ethReward = ethers.utils.parseEther(testData.faucetReward)

        // check wallet balances of funded addresses
        for (const address of fundedAddresses) {
            expect(await ethers.provider.getBalance(address)).to.be.equal(ethReward)
        }

        const initialBalance = ethers.utils.parseEther("10000")

        // check wallet balances of non-funded addresses
        for (const address of nonFundedAddresses) {
            expect(await ethers.provider.getBalance(address)).to.be.equal(initialBalance)
        }
    });

    it("Should auto-invest for campaign without KYC after user receives funds", async function () {
        await testData.setupIssuerAssetAndCampaign({campaignWhitelistRequired: false});

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

    it("Should auto-invest for campaign with KYC after user is whitelisted and receives funds", async function () {
        await testData.setupIssuerAssetAndCampaign({campaignWhitelistRequired: true});

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

        expect(await testData.cfManager.investmentAmount(franksAddress)).to.be.equal(franksInvestmentWei)
    });

    afterEach(async function () {
        await db.clearDb()
        await docker.hardhat.down()
    });

    after(async function () {
        await docker.backend.down()
    });
})
