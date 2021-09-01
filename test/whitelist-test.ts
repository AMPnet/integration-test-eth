// @ts-ignore
import { ethers } from "hardhat";
import { Contract, Signer } from "ethers";
import { expect } from "chai";
import * as helpers from "../util/helpers";
import { it } from "mocha";
// @ts-ignore
import * as docker from "../util/docker";
import * as userService from "../util/user-service";
import * as reportService from "../util/report-service";
import * as deployerServiceUtil from "../util/deployer-service";

describe("Whitelist user address", function () {

    //////// FACTORIES ////////
    let issuerFactory: Contract;
    let assetFactory: Contract;
    let assetTransferableFactory: Contract;
    let cfManagerFactory: Contract;
    let payoutManagerFactory: Contract;

    //////// SERVICES ////////
    let walletApproverService: Contract;
    let deployerService: Contract;
    let queryService: Contract;

    ////////// APX //////////
    let apxRegistry: Contract;

    //////// SIGNERS ////////
    let deployer: Signer;
    let assetManager: Signer;
    let priceManager: Signer;
    let walletApprover: Signer;
    let issuerOwner: Signer;
    let alice: Signer;
    let jane: Signer;
    let frank: Signer;

    //////// CONTRACTS ////////
    let stablecoin: Contract;
    let issuer: Contract;
    let asset: Contract;
    let cfManager: Contract;

    beforeEach(async function () {
        await docker.up();

        const accounts: Signer[] = await ethers.getSigners();
        deployer        = accounts[0];
        issuerOwner     = accounts[1];
        priceManager    = accounts[2];
        alice           = accounts[3];
        jane            = accounts[4];
        frank           = accounts[5];
        walletApprover  = accounts[6];
        assetManager    = accounts[7];

        console.log("Deployer: ", await deployer.getAddress())

        stablecoin = await helpers.deployStablecoin(deployer, "1000000000000");
        apxRegistry = await helpers.deployApxRegistry(
            deployer,
            await deployer.getAddress(),
            await assetManager.getAddress(),
            await priceManager.getAddress()
        );

        const factories = await helpers.deployFactories(deployer);
        issuerFactory = factories[0];
        assetFactory = factories[1];
        assetTransferableFactory = factories[2];
        cfManagerFactory = factories[3];
        payoutManagerFactory = factories[4];

        const walletApproverAddress = await walletApprover.getAddress();
        const services = await helpers.deployServices(
            deployer,
            walletApproverAddress,
            "0.001"
        );
        walletApproverService = services[0];
        deployerService = services[1];
        queryService = services[2];
    });

    it("Should whitelist user", async function () {
        //// Set the config for Issuer, Asset and Crowdfunding Campaign
        const issuerAnsName = "test-issuer";
        const issuerInfoHash = "issuer-info-ipfs-hash";
        const issuerOwnerAddress = await issuerOwner.getAddress();
        const assetName = "Test Asset";
        const assetAnsName = "test-asset";
        const assetTicker = "TSTA";
        const assetInfoHash = "asset-info-ipfs-hash";
        const assetWhitelistRequiredForRevenueClaim = true;
        const assetWhitelistRequiredForLiquidationClaim = true;
        const assetTokenSupply = 300000;              // 300k tokens total supply
        const campaignInitialPricePerToken = 10000;   // 1$ per token
        const maxTokensToBeSold = 200000;             // 200k tokens to be sold at most (200k $$$ to be raised at most)
        const campaignSoftCap = 100000;               // minimum $100k funds raised has to be reached for campaign to succeed
        const campaignMinInvestment = 10000;          // $10k min investment per user
        const campaignMaxInvestment = 400000;         // $200k max investment per user
        const campaignWhitelistRequired = true;       // only whitelisted wallets can invest
        const campaignAnsName = "test-campaign";
        const campaignInfoHash = "campaign-info-ipfs-hash";
        const childChainManager = ethers.Wallet.createRandom().address;

        //// Deploy the contracts with the provided config
        issuer = await helpers.createIssuer(
            issuerOwnerAddress,
            issuerAnsName,
            stablecoin,
            walletApproverService.address,
            issuerInfoHash,
            issuerFactory
        );
        const contracts = await deployerServiceUtil.createAssetTransferableCampaign(
            issuer,
            issuerOwnerAddress,
            assetAnsName,
            assetTokenSupply,
            assetWhitelistRequiredForRevenueClaim,
            assetWhitelistRequiredForLiquidationClaim,
            assetName,
            assetTicker,
            assetInfoHash,
            issuerOwnerAddress,
            campaignAnsName,
            campaignInitialPricePerToken,
            campaignSoftCap,
            campaignMinInvestment,
            campaignMaxInvestment,
            maxTokensToBeSold,
            campaignWhitelistRequired,
            campaignInfoHash,
            apxRegistry.address,
            childChainManager,
            assetTransferableFactory,
            cfManagerFactory,
            deployerService
        );
        asset = contracts[0];
        cfManager = contracts[1];

        const franksAddress = await frank.getAddress()
        const payload = await userService.getPayload(franksAddress)
        const franksAccessToken = await userService.getAccessToken(franksAddress, await frank.signMessage(payload))
        await userService.completeKyc(franksAccessToken, franksAddress)
        await userService.whitelistAddress(franksAccessToken, issuer.address, await frank.getChainId())

        await new Promise(f => setTimeout(f, 5000))
        const isWalletApproved = await issuer.isWalletApproved(franksAddress)
        console.log("Wallet approved: ", isWalletApproved)
        expect(isWalletApproved).to.be.true

        // Generate xlsx report
        const adminsPayload = await userService.getPayload(issuerOwnerAddress)
        const adminsAccessToken = await userService
            .getAccessToken(issuerOwnerAddress, await issuerOwner.signMessage(adminsPayload))
        const xlsxReport = await reportService
            .getXlsxReport(adminsAccessToken, issuer.address, await issuerOwner.getChainId())
        expect(xlsxReport?.status).to.equal(200)

        //// Frank buys $100k USDC and goes through kyc process (wallet approved)
        const franksInvestment = 100000
        const franksInvestmentWei = ethers.utils.parseEther(franksInvestment.toString())
        await stablecoin.transfer(franksAddress, franksInvestmentWei)

        //// Frank invests $100k USDC in the project and then cancels her investment and then invests again
        await helpers.invest(frank, cfManager, stablecoin, franksInvestment)
        await helpers.cancelInvest(frank, cfManager)
        await helpers.invest(frank, cfManager, stablecoin, franksInvestment)

        // Get transaction history
        const txHistory = await reportService
            .getTxHistory(franksAccessToken, issuer.address, await issuerOwner.getChainId())
        // Uncomment after the report-service is fixed
        // console.log("TxHistory: ", await txHistory?.data)
        // expect(await txHistory?.data.transactions.size).is.equal(3)
    })

    after(async function () {
        await docker.down()
    })
})
