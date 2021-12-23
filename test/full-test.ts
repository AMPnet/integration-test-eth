// @ts-ignore
import {ethers} from "hardhat";
import {Contract, Signer} from "ethers";
import {expect} from "chai";
import * as helpers from "../util/helpers";
import {it} from "mocha";
// @ts-ignore
import * as docker from "../util/docker";
import * as userService from "../util/user-service";
import * as reportService from "../util/report-service";
import * as deployerServiceUtil from "../util/deployer-service";
import * as db from "../util/db"
import {DockerEnv} from "../util/types";

describe("Full flow test", function () {

    //////// FACTORIES ////////
    let issuerFactory: Contract;
    let assetFactory: Contract;
    let assetTransferableFactory: Contract;
    let assetSimpleFactory: Contract;
    let cfManagerFactory: Contract;
    let cfManagerVestingFactory: Contract;
    let payoutManagerFactory: Contract;

    //////// SERVICES ////////
    let walletApproverService: Contract;
    let deployerService: Contract;
    let queryService: Contract;
    let investService: Contract;
    let faucetService: Contract;

    ////////// APX //////////
    let apxRegistry: Contract;
    let nameRegistry: Contract;
    let feeManager: Contract;

    //////// SIGNERS ////////
    let deployer: Signer;
    let assetManager: Signer;
    let priceManager: Signer;
    let walletApprover: Signer;
    let issuerOwner: Signer;
    let alice: Signer;
    let jane: Signer;
    let frank: Signer;
    let mark: Signer;
    let treasury: Signer;
    let faucetCaller: Signer;
    let autoInvestor: Signer;

    //////// CONTRACTS ////////
    let stablecoin: Contract;
    let issuer: Contract;
    let asset: Contract;
    let cfManager: Contract;

    //////// CONSTANTS ////////
    const faucetReward = "0.1"

    beforeEach(async function () {
        await docker.hardhat.up();

        const accounts: Signer[] = await ethers.getSigners();
        deployer        = accounts[0];
        assetManager    = accounts[1];
        priceManager    = accounts[2];
        walletApprover  = accounts[3];
        issuerOwner     = accounts[4];
        alice           = accounts[5];
        jane            = accounts[6];
        frank           = accounts[7];
        mark            = accounts[8];
        treasury        = accounts[9];
        faucetCaller    = accounts[10];
        autoInvestor    = accounts[11];

        stablecoin = await helpers.deployStablecoin(deployer, "1000000000000", "6");

        const factories = await helpers.deployFactories(deployer);
        issuerFactory = factories[0];
        assetFactory = factories[1];
        assetTransferableFactory = factories[2];
        assetSimpleFactory = factories[3];
        cfManagerFactory = factories[4];
        cfManagerVestingFactory = factories[5];
        payoutManagerFactory = factories[6];

        apxRegistry = await helpers.deployApxRegistry(
            deployer,
            await deployer.getAddress(),
            await assetManager.getAddress(),
            await priceManager.getAddress()
        );
        nameRegistry = await helpers.deployNameRegistry(
            deployer,
            await deployer.getAddress(),
            factories.map(factory => factory.address)
        );
        feeManager = await helpers.deployFeeManager(
          deployer,
          await deployer.getAddress(),
          await treasury.getAddress()
        );

        const walletApproverAddress = await walletApprover.getAddress();
        const faucetCallerAddress = await faucetCaller.getAddress();
        const services = await helpers.deployServices(
            deployer,
            walletApproverAddress,
            [ faucetCallerAddress ],
            faucetReward,
            "0"
        );
        walletApproverService = services[0];
        deployerService = services[1];
        queryService = services[2];
        investService = services[3];
        faucetService = services[4];

        const dockerEnv: DockerEnv = {
            WALLET_APPROVER_ADDRESS: walletApproverService.address,
            FAUCET_SERVICE_ADDRESS: faucetService.address,
            AUTO_INVEST_SERVICE_ADDRESS: investService.address,
            CF_MANAGER_FACTORY_ADDRESS_0: cfManagerFactory.address,
            SNAPSHOT_DISTRIBUTOR_ADDRESS_0: payoutManagerFactory.address
        };
        await docker.backend.up(dockerEnv);
    });

    it("Should whitelist user and get tx history", async function () {
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

        //// Deploy the contracts with the provided config
        issuer = await helpers.createIssuer(
            issuerOwnerAddress,
            issuerAnsName,
            stablecoin,
            walletApproverService.address,
            issuerInfoHash,
            issuerFactory,
            nameRegistry
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
            nameRegistry.address,
            feeManager.address,
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
        const franksInvestmentWei = ethers.utils.parseUnits(franksInvestment.toString(), "6")
        await stablecoin.transfer(franksAddress, franksInvestmentWei)

        //// Frank invests $100k USDC in the project and then cancels her/his investment and then invests again
        await helpers.invest(frank, cfManager, stablecoin, franksInvestment)
        await helpers.cancelInvest(frank, cfManager)
        await helpers.invest(frank, cfManager, stablecoin, franksInvestment)

        // Add additional blockchain transaction
        await stablecoin.transfer(await jane.getAddress(), franksInvestmentWei)

        // Get transaction history
        await new Promise(f => setTimeout(f, 2000))
        const txHistory = await reportService
            .getTxHistory(franksAccessToken, issuer.address, await issuerOwner.getChainId())
        expect(await txHistory?.data.transactions.length).is.equal(3)
    });

    it("Should only send faucet funds to accounts below faucet threshold", async function () {
        // send some funds to the faucet contract
        await deployer.sendTransaction({
            to: faucetService.address,
            value: ethers.utils.parseEther("10")
        });

        // generate random user addresses below threshold (zero funds)
        const fundedAddresses = Array.from({length: 10}, () => ethers.Wallet.createRandom().address)

        // existing accounts are already funded and therefore above faucet threshold
        const nonFundedAddresses = [
            await alice.getAddress(),
            await jane.getAddress(),
            await frank.getAddress(),
            await mark.getAddress()
        ]

        const allAddresses = [...fundedAddresses, ...nonFundedAddresses]
        const chainId = await faucetCaller.getChainId()

        // request faucet funds for each account
        for (let address of allAddresses) {
            await userService.requestFaucetFunds(address, chainId)
        }

        // wait for faucet funds to be sent
        await new Promise(f => setTimeout(f, 5000))

        const ethReward = ethers.utils.parseEther(faucetReward)

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
        const campaignWhitelistRequired = false;      // any wallet can invest
        const campaignAnsName = "test-campaign";
        const campaignInfoHash = "campaign-info-ipfs-hash";

        //// Deploy the contracts with the provided config
        issuer = await helpers.createIssuer(
            issuerOwnerAddress,
            issuerAnsName,
            stablecoin,
            walletApproverService.address,
            issuerInfoHash,
            issuerFactory,
            nameRegistry
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
            nameRegistry.address,
            feeManager.address,
            assetTransferableFactory,
            cfManagerFactory,
            deployerService
        );
        asset = contracts[0];
        cfManager = contracts[1];

        const franksAddress = await frank.getAddress()
        const payload = await userService.getPayload(franksAddress)
        const franksAccessToken = await userService.getAccessToken(franksAddress, await frank.signMessage(payload))

        //// Frank reserves $100k USDC for investment
        const franksInvestment = 100000
        const franksInvestmentWei = ethers.utils.parseUnits(franksInvestment.toString(), "6")
        const chainId = await frank.getChainId()

        await stablecoin.connect(frank).approve(cfManager.address, franksInvestmentWei)

        // Frank request auto-invest
        await userService.autoInvest(franksAccessToken, cfManager.address, franksInvestmentWei.toString(), chainId)

        // auto-invest should not be triggered yet
        await new Promise(f => setTimeout(f, 5000))
        expect(await cfManager.investmentAmount(franksAddress)).to.be.equal(ethers.utils.parseEther("0"))

        //// Frank buys $100k USDC
        await stablecoin.transfer(franksAddress, franksInvestmentWei)

        // auto-invest should be completed after this
        await new Promise(f => setTimeout(f, 5000))

        // Frank should have an investment after auto-invest has been completed
        expect(await cfManager.investmentAmount(franksAddress)).to.be.equal(franksInvestmentWei)
    });

    it("Should auto-invest for campaign with KYC after user is whitelisted and receives funds", async function () {
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

        //// Deploy the contracts with the provided config
        issuer = await helpers.createIssuer(
            issuerOwnerAddress,
            issuerAnsName,
            stablecoin,
            walletApproverService.address,
            issuerInfoHash,
            issuerFactory,
            nameRegistry
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
            nameRegistry.address,
            feeManager.address,
            assetTransferableFactory,
            cfManagerFactory,
            deployerService
        );
        asset = contracts[0];
        cfManager = contracts[1];

        const franksAddress = await frank.getAddress()
        const payload = await userService.getPayload(franksAddress)
        const franksAccessToken = await userService.getAccessToken(franksAddress, await frank.signMessage(payload))

        //// Frank reserves $100k USDC for investment
        const franksInvestment = 100000
        const franksInvestmentWei = ethers.utils.parseUnits(franksInvestment.toString(), "6")
        const chainId = await frank.getChainId()

        await stablecoin.connect(frank).approve(cfManager.address, franksInvestmentWei)

        // Frank request auto-invest
        await userService.autoInvest(franksAccessToken, cfManager.address, franksInvestmentWei.toString(), chainId)

        // auto-invest should not be triggered yet
        await new Promise(f => setTimeout(f, 5000))
        expect(await cfManager.investmentAmount(franksAddress)).to.be.equal(ethers.utils.parseEther("0"))

        //// Frank buys $100k USDC
        await stablecoin.transfer(franksAddress, franksInvestmentWei)

        // auto-invest should not be completed after this - still needs whitelisting
        await new Promise(f => setTimeout(f, 5000))

        // whitelist Frank's wallet
        await userService.completeKyc(franksAccessToken, franksAddress)
        await userService.whitelistAddress(franksAccessToken, issuer.address, await frank.getChainId())

        await new Promise(f => setTimeout(f, 5000))
        const isWalletApproved = await issuer.isWalletApproved(franksAddress)
        expect(isWalletApproved).to.be.true

        // auto-invest should be completed after this
        await new Promise(f => setTimeout(f, 5000))

        expect(await cfManager.investmentAmount(franksAddress)).to.be.equal(franksInvestmentWei)
    });

    afterEach(async function () {
        await db.clearDb()
        await docker.backend.down()
        await docker.hardhat.down()
    });
})
