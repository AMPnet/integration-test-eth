// @ts-ignore
import {ethers} from "hardhat";
import {Contract, Signer} from "ethers";
import * as helpers from "../util/helpers";
import * as deployerServiceUtil from "../util/deployer-service";

export class TestData {

    //////// FACTORIES ////////
    issuerFactory: Contract;
    assetFactory: Contract;
    assetTransferableFactory: Contract;
    assetSimpleFactory: Contract;
    cfManagerFactory: Contract;
    cfManagerVestingFactory: Contract;
    payoutManagerFactory: Contract;

    //////// SERVICES ////////
    walletApproverService: Contract;
    deployerService: Contract;
    queryService: Contract;
    investService: Contract;
    faucetService: Contract;

    ////////// APX //////////
    apxRegistry: Contract;
    nameRegistry: Contract;
    feeManager: Contract;

    //////// SIGNERS ////////
    deployer: Signer;
    assetManager: Signer;
    priceManager: Signer;
    walletApprover: Signer;
    issuerOwner: Signer;
    alice: Signer;
    jane: Signer;
    frank: Signer;
    mark: Signer;
    treasury: Signer;
    faucetCaller: Signer;
    autoInvestor: Signer;

    //////// CONTRACTS ////////
    stablecoin: Contract;
    issuer: Contract;
    asset: Contract;
    cfManager: Contract;

    //////// CONSTANTS ////////
    faucetReward = "0.1"

    async setupContracts() {
        const accounts: Signer[] = await ethers.getSigners();
        this.deployer        = accounts[0];
        this.assetManager    = accounts[1];
        this.priceManager    = accounts[2];
        this.walletApprover  = accounts[3];
        this.issuerOwner     = accounts[4];
        this.alice           = accounts[5];
        this.jane            = accounts[6];
        this.frank           = accounts[7];
        this.mark            = accounts[8];
        this.treasury        = accounts[9];
        this.faucetCaller    = accounts[10];
        this.autoInvestor    = accounts[11];

        this.stablecoin = await helpers.deployStablecoin(this.deployer, "1000000000000", "6");

        const factories = await helpers.deployFactories(this.deployer);
        this.issuerFactory = factories[0];
        this.assetFactory = factories[1];
        this.assetTransferableFactory = factories[2];
        this.assetSimpleFactory = factories[3];
        this.cfManagerFactory = factories[4];
        this.cfManagerVestingFactory = factories[5];
        this.payoutManagerFactory = factories[6];

        this.apxRegistry = await helpers.deployApxRegistry(
            this.deployer,
            await this.deployer.getAddress(),
            await this.assetManager.getAddress(),
            await this.priceManager.getAddress()
        );
        this.nameRegistry = await helpers.deployNameRegistry(
            this.deployer,
            await this.deployer.getAddress(),
            factories.map(factory => factory.address)
        );
        this.feeManager = await helpers.deployFeeManager(
          this.deployer,
          await this.deployer.getAddress(),
          await this.treasury.getAddress()
        );

        const walletApproverAddress = await this.walletApprover.getAddress();
        const faucetCallerAddress = await this.faucetCaller.getAddress();
        const services = await helpers.deployServices(
            this.deployer,
            walletApproverAddress,
            [ faucetCallerAddress ],
            this.faucetReward,
            "0"
        );
        this.walletApproverService = services[0];
        this.deployerService = services[1];
        this.queryService = services[2];
        this.investService = services[3];
        this.faucetService = services[4];
    }

    async setupIssuerAssetAndCampaign(args: {campaignWhitelistRequired: boolean}) {
        //// Set the config for Issuer, Asset and Crowdfunding Campaign
        const issuerAnsName = "test-issuer";
        const issuerInfoHash = "issuer-info-ipfs-hash";
        const issuerOwnerAddress = await this.issuerOwner.getAddress();
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
        const campaignAnsName = "test-campaign";
        const campaignInfoHash = "campaign-info-ipfs-hash";

        //// Deploy the contracts with the provided config
        this.issuer = await helpers.createIssuer(
            issuerOwnerAddress,
            issuerAnsName,
            this.stablecoin,
            this.walletApproverService.address,
            issuerInfoHash,
            this.issuerFactory,
            this.nameRegistry
        );
        const contracts = await deployerServiceUtil.createAssetTransferableCampaign(
            this.issuer,
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
            args.campaignWhitelistRequired,
            campaignInfoHash,
            this.apxRegistry.address,
            this.nameRegistry.address,
            this.feeManager.address,
            this.assetTransferableFactory,
            this.cfManagerFactory,
            this.deployerService
        );
        this.asset = contracts[0];
        this.cfManager = contracts[1];
    }
}
