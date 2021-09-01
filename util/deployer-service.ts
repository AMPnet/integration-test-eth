// @ts-ignore
import { ethers } from "hardhat";
import { Contract } from "ethers";

export async function createIssuerAssetCampaign(
    issuerOwner: String,
    issuerAnsName: String,
    issuerStablecoin: String,
    issuerWalletApprover: String,
    issuerInfo: String,
    assetOwner: String,
    assetAnsName: String,
    assetInitialTokenSupply: Number,
    assetWhitelistRequired: boolean,
    assetName: String,
    assetSymbol: String,
    assetInfo: String,
    cfManagerOwner: String,
    cfManagerAnsName: String,
    cfManagerPricePerToken: Number,
    cfManagerSoftcap: Number,
    cfManagerMinInvestment: Number,
    cfManagerMaxInvestment: Number,
    cfManagerTokensToSellAmount: Number,
    cfManagerWhitelistRequired: boolean,
    cfManagerInfo: String,
    issuerFactory: Contract,
    assetFactory: Contract,
    cfManagerFactory: Contract,
    deployerService: Contract
  ): Promise<Array<Contract>> {
    const assetInitialTokenSupplyWei = ethers.utils.parseEther(assetInitialTokenSupply.toString());
    const cfManagerSoftcapWei = ethers.utils.parseEther(cfManagerSoftcap.toString());
    const cfManagerTokensToSellAmountWei = ethers.utils.parseEther(cfManagerTokensToSellAmount.toString());
    const cfManagerMinInvestmentWei = ethers.utils.parseEther(cfManagerMinInvestment.toString());
    const cfManagerMaxInvestmentWei = ethers.utils.parseEther(cfManagerMaxInvestment.toString());
    const deployTx = await deployerService.deployIssuerAssetCampaign(
      [
        issuerFactory.address,
        assetFactory.address,
        cfManagerFactory.address,
        issuerOwner,
        issuerAnsName,
        issuerStablecoin,
        issuerWalletApprover,
        issuerInfo,
        assetOwner,
        assetAnsName,
        assetInitialTokenSupplyWei,
        assetWhitelistRequired,
        assetName,
        assetSymbol,
        assetInfo,
        cfManagerOwner,
        cfManagerAnsName,
        cfManagerPricePerToken,
        cfManagerSoftcapWei,
        cfManagerMinInvestmentWei,
        cfManagerMaxInvestmentWei,
        cfManagerTokensToSellAmountWei,
        cfManagerWhitelistRequired,
        cfManagerInfo
      ]
    );
    const receipt = await ethers.provider.waitForTransaction(deployTx.hash);
    
    let issuerAddress: string;
    let assetAddress: string;
    let cfManagerAddress: string;
    for (const log of receipt.logs) {
      try {
        const parsedLog = issuerFactory.interface.parseLog(log);
        if (parsedLog.name == "IssuerCreated") {
          const ownerAddress = parsedLog.args.creator;
          const id = parsedLog.args.id;
          issuerAddress = parsedLog.args.issuer;
          console.log(`\nIssuer deployed\n\tAt address: ${issuerAddress}\n\tOwner: ${ownerAddress}\n\tID: ${id}`);
        }
      } catch (_) {}
  
      try {
        const parsedLog = assetFactory.interface.parseLog(log);
        if (parsedLog.name == "AssetCreated") {
          const ownerAddress = parsedLog.args.creator;
          const id = parsedLog.args.id;
          assetAddress = parsedLog.args.asset;
          console.log(`\nAsset deployed\n\tAt address: ${assetAddress}\n\tOwner: ${ownerAddress}\n\tID: ${id}`);
        }
      } catch (_) {}
  
      try {
        const parsedLog = cfManagerFactory.interface.parseLog(log);
        if (parsedLog.name == "CfManagerSoftcapCreated") {
          const ownerAddress = parsedLog.args.creator;
          const assetAddress = parsedLog.args.asset;
          const id = parsedLog.args.id;
          cfManagerAddress = parsedLog.args.cfManager;
          console.log(`\nCrowdfunding Campaign deployed\n\tAt address: ${cfManagerAddress}\n\tOwner: ${ownerAddress}\n\tAsset: ${assetAddress}\n\tID: ${id}`);
        }
      } catch (_) {}
    }
    const issuer = await ethers.getContractAt("Issuer", issuerAddress);
    const asset = await ethers.getContractAt("Asset", assetAddress);
    const campaign = await ethers.getContractAt("CfManagerSoftcap", cfManagerAddress);
  
    return [issuer, asset, campaign];
  }
  
  export async function createAssetCampaign(
    issuer: Contract,
    assetOwner: String,
    assetAnsName: String,
    assetInitialTokenSupply: Number,
    assetWhitelistRequired: boolean,
    assetName: String,
    assetSymbol: String,
    assetInfo: String,
    cfManagerOwner: String,
    cfManagerAnsName: String,
    cfManagerPricePerToken: Number,
    cfManagerSoftcap: Number,
    cfManagerMinInvestment: Number,
    cfManagerMaxInvestment: Number,
    cfManagerTokensToSellAmount: Number,
    cfManagerWhitelistRequired: boolean,
    cfManagerInfo: String,
    assetFactory: Contract,
    cfManagerFactory: Contract,
    deployerService: Contract
  ): Promise<Array<Contract>> {
    const assetInitialTokenSupplyWei = ethers.utils.parseEther(assetInitialTokenSupply.toString());
    const cfManagerSoftcapWei = ethers.utils.parseEther(cfManagerSoftcap.toString());
    const cfManagerMinInvestmentWei = ethers.utils.parseEther(cfManagerMinInvestment.toString());
    const cfManagerMaxInvestmentWei = ethers.utils.parseEther(cfManagerMaxInvestment.toString());
    const cfManagerTokensToSellAmountWei = ethers.utils.parseEther(cfManagerTokensToSellAmount.toString());
    const deployTx = await deployerService.deployAssetCampaign(
      [
        assetFactory.address,
        cfManagerFactory.address,
        issuer.address,
        assetOwner,
        assetAnsName,
        assetInitialTokenSupplyWei,
        assetWhitelistRequired,
        assetName,
        assetSymbol,
        assetInfo,
        cfManagerOwner,
        cfManagerAnsName,
        cfManagerPricePerToken,
        cfManagerSoftcapWei,
        cfManagerMinInvestmentWei,
        cfManagerMaxInvestmentWei,
        cfManagerTokensToSellAmountWei,
        cfManagerWhitelistRequired,
        cfManagerInfo
      ]
    );
    const receipt = await ethers.provider.waitForTransaction(deployTx.hash);
  
    let assetAddress: string;
    let cfManagerAddress: string;
    for (const log of receipt.logs) {
      try {
        const parsedLog = assetFactory.interface.parseLog(log);
        if (parsedLog.name == "AssetCreated") {
          const ownerAddress = parsedLog.args.creator;
          const id = parsedLog.args.id;
          assetAddress = parsedLog.args.asset;
          console.log(`\nAsset deployed\n\tAt address: ${assetAddress}\n\tOwner: ${ownerAddress}\n\tID: ${id}`);
        }
      } catch (_) {}
  
      try {
        const parsedLog = cfManagerFactory.interface.parseLog(log);
        if (parsedLog.name == "CfManagerSoftcapCreated") {
          const ownerAddress = parsedLog.args.creator;
          const assetAddress = parsedLog.args.asset;
          const id = parsedLog.args.id;
          cfManagerAddress = parsedLog.args.cfManager;
          console.log(`\nCrowdfunding Campaign deployed\n\tAt address: ${cfManagerAddress}\n\tOwner: ${ownerAddress}\n\tAsset: ${assetAddress}\n\tID: ${id}`);
        }
      } catch (_) {}
    }
    const asset = await ethers.getContractAt("Asset", assetAddress);
    const campaign = await ethers.getContractAt("CfManagerSoftcap", cfManagerAddress);
  
    return [asset, campaign];
}

export async function createIssuerAssetTransferableCampaign(
    issuerOwner: String,
    issuerAnsName: String,
    issuerStablecoin: String,
    issuerWalletApprover: String,
    issuerInfo: String,
    assetOwner: String,
    assetAnsName: String,
    assetInitialTokenSupply: Number,
    assetWhitelistRequiredForRevenueClaim: boolean,
    assetWhitelistRequiredForLiquidationClaim: boolean,
    assetName: String,
    assetSymbol: String,
    assetInfo: String,
    cfManagerOwner: String,
    cfManagerAnsName: String,
    cfManagerPricePerToken: Number,
    cfManagerSoftcap: Number,
    cfManagerMinInvestment: Number,
    cfManagerMaxInvestment: Number,
    cfManagerTokensToSellAmount: Number,
    cfManagerWhitelistRequired: boolean,
    cfManagerInfo: String,
    apxRegistry: String,
    childChainManager: String,
    issuerFactory: Contract,
    assetTransferableFactory: Contract,
    cfManagerFactory: Contract,
    deployerService: Contract
  ): Promise<Array<Contract>> {
    const assetInitialTokenSupplyWei = ethers.utils.parseEther(assetInitialTokenSupply.toString());
    const cfManagerSoftcapWei = ethers.utils.parseEther(cfManagerSoftcap.toString());
    const cfManagerTokensToSellAmountWei = ethers.utils.parseEther(cfManagerTokensToSellAmount.toString());
    const cfManagerMinInvestmentWei = ethers.utils.parseEther(cfManagerMinInvestment.toString());
    const cfManagerMaxInvestmentWei = ethers.utils.parseEther(cfManagerMaxInvestment.toString());
    const deployTx = await deployerService.deployIssuerAssetTransferableCampaign(
      [
        issuerFactory.address,
        assetTransferableFactory.address,
        cfManagerFactory.address,
        issuerOwner,
        issuerAnsName,
        issuerStablecoin,
        issuerWalletApprover,
        issuerInfo,
        assetOwner,
        assetAnsName,
        assetInitialTokenSupplyWei,
        assetWhitelistRequiredForRevenueClaim,
        assetWhitelistRequiredForLiquidationClaim,
        assetName,
        assetSymbol,
        assetInfo,
        cfManagerOwner,
        cfManagerAnsName,
        cfManagerPricePerToken,
        cfManagerSoftcapWei,
        cfManagerMinInvestmentWei,
        cfManagerMaxInvestmentWei,
        cfManagerTokensToSellAmountWei,
        cfManagerWhitelistRequired,
        cfManagerInfo,
        apxRegistry,
        childChainManager
      ]
    );
    const receipt = await ethers.provider.waitForTransaction(deployTx.hash);
    
    let issuerAddress: string;
    let assetTransferableAddress: string;
    let cfManagerAddress: string;
    for (const log of receipt.logs) {
      try {
        const parsedLog = issuerFactory.interface.parseLog(log);
        if (parsedLog.name == "IssuerCreated") {
          const ownerAddress = parsedLog.args.creator;
          const id = parsedLog.args.id;
          issuerAddress = parsedLog.args.issuer;
          console.log(`\nIssuer deployed\n\tAt address: ${issuerAddress}\n\tOwner: ${ownerAddress}\n\tID: ${id}`);
        }
      } catch (_) {}
  
      try {
        const parsedLog = assetTransferableFactory.interface.parseLog(log);
        if (parsedLog.name == "AssetTransferableCreated") {
          const ownerAddress = parsedLog.args.creator;
          const id = parsedLog.args.id;
          assetTransferableAddress = parsedLog.args.asset;
          console.log(`\nAsset deployed\n\tAt address: ${assetTransferableAddress}\n\tOwner: ${ownerAddress}\n\tID: ${id}`);
        }
      } catch (_) {}
  
      try {
        const parsedLog = cfManagerFactory.interface.parseLog(log);
        if (parsedLog.name == "CfManagerSoftcapCreated") {
          const ownerAddress = parsedLog.args.creator;
          const assetAddress = parsedLog.args.asset;
          const id = parsedLog.args.id;
          cfManagerAddress = parsedLog.args.cfManager;
          console.log(`\nCrowdfunding Campaign deployed\n\tAt address: ${cfManagerAddress}\n\tOwner: ${ownerAddress}\n\tAsset: ${assetAddress}\n\tID: ${id}`);
        }
      } catch (_) {}
    }
    const issuer = await ethers.getContractAt("Issuer", issuerAddress);
    const assetTransferable = await ethers.getContractAt("AssetTransferable", assetTransferableAddress);
    const campaign = await ethers.getContractAt("CfManagerSoftcap", cfManagerAddress);
  
    return [issuer, assetTransferable, campaign];
}

export async function createAssetTransferableCampaign(
    issuer: Contract,
    assetOwner: String,
    assetAnsName: String,
    assetInitialTokenSupply: Number,
    assetWhitelistRequiredForRevenueClaim: boolean,
    assetWhitelistRequiredForLiquidationClaim: boolean,
    assetName: String,
    assetSymbol: String,
    assetInfo: String,
    cfManagerOwner: String,
    cfManagerAnsName: String,
    cfManagerPricePerToken: Number,
    cfManagerSoftcap: Number,
    cfManagerMinInvestment: Number,
    cfManagerMaxInvestment: Number,
    cfManagerTokensToSellAmount: Number,
    cfManagerWhitelistRequired: boolean,
    cfManagerInfo: String,
    apxRegistry: String,
    childChainManager: String,
    assetTransferableFactory: Contract,
    cfManagerFactory: Contract,
    deployerService: Contract
  ): Promise<Array<Contract>> {
    const assetInitialTokenSupplyWei = ethers.utils.parseEther(assetInitialTokenSupply.toString());
    const cfManagerSoftcapWei = ethers.utils.parseEther(cfManagerSoftcap.toString());
    const cfManagerMinInvestmentWei = ethers.utils.parseEther(cfManagerMinInvestment.toString());
    const cfManagerMaxInvestmentWei = ethers.utils.parseEther(cfManagerMaxInvestment.toString());
    const cfManagerTokensToSellAmountWei = ethers.utils.parseEther(cfManagerTokensToSellAmount.toString());
    const deployTx = await deployerService.deployAssetTransferableCampaign(
      [
        assetTransferableFactory.address,
        cfManagerFactory.address,
        issuer.address,
        assetOwner,
        assetAnsName,
        assetInitialTokenSupplyWei,
        assetWhitelistRequiredForRevenueClaim,
        assetWhitelistRequiredForLiquidationClaim,
        assetName,
        assetSymbol,
        assetInfo,
        cfManagerOwner,
        cfManagerAnsName,
        cfManagerPricePerToken,
        cfManagerSoftcapWei,
        cfManagerMinInvestmentWei,
        cfManagerMaxInvestmentWei,
        cfManagerTokensToSellAmountWei,
        cfManagerWhitelistRequired,
        cfManagerInfo,
        apxRegistry,
        childChainManager
      ]
    );
    const receipt = await ethers.provider.waitForTransaction(deployTx.hash);
  
    let assetTransferableAddress: string;
    let cfManagerAddress: string;
    for (const log of receipt.logs) {
      try {
        const parsedLog = assetTransferableFactory.interface.parseLog(log);
        if (parsedLog.name == "AssetTransferableCreated") {
          const ownerAddress = parsedLog.args.creator;
          const id = parsedLog.args.id;
          assetTransferableAddress = parsedLog.args.asset;
          console.log(`\nAssetTransferable deployed\n\tAt address: ${assetTransferableAddress}\n\tOwner: ${ownerAddress}\n\tID: ${id}`);
        }
      } catch (_) {}
  
      try {
        const parsedLog = cfManagerFactory.interface.parseLog(log);
        if (parsedLog.name == "CfManagerSoftcapCreated") {
          const ownerAddress = parsedLog.args.creator;
          const assetAddress = parsedLog.args.asset;
          const id = parsedLog.args.id;
          cfManagerAddress = parsedLog.args.cfManager;
          console.log(`\nCrowdfunding Campaign deployed\n\tAt address: ${cfManagerAddress}\n\tOwner: ${ownerAddress}\n\tAsset: ${assetAddress}\n\tID: ${id}`);
        }
      } catch (_) {}
    }
    const assetTransferable = await ethers.getContractAt("AssetTransferable", assetTransferableAddress);
    const campaign = await ethers.getContractAt("CfManagerSoftcap", cfManagerAddress);
  
    return [assetTransferable, campaign];
}