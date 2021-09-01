// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../tokens/erc20/ERC20.sol";
import "../tokens/erc20/ERC20Snapshot.sol";
import "../tokens/matic/IChildToken.sol";
import "./IAssetTransferable.sol";
import "../issuer/IIssuer.sol";
import "../managers/crowdfunding-softcap/ICfManagerSoftcap.sol";
import "../tokens/erc20/IToken.sol";
import "../apx-protocol/IApxAssetsRegistry.sol";
import "../shared/Structs.sol";

contract AssetTransferable is IAssetTransferable, IChildToken, ERC20Snapshot {
    using SafeERC20 for IERC20;

    //------------------------
    //  CONSTANTS
    //------------------------
    uint256 constant public override priceDecimalsPrecision = 10 ** 4;

    //----------------------
    //  STATE
    //------------------------
    Structs.AssetTransferableState private state;
    Structs.InfoEntry[] private infoHistory;
    Structs.WalletRecord[] private approvedCampaigns;
    Structs.TokenSaleInfo[] private sellHistory;
    mapping (address => uint256) public approvedCampaignsMap;
    mapping (address => Structs.TokenSaleInfo) public successfulTokenSalesMap;
    mapping (address => uint256) public liquidationClaimsMap;

    //------------------------
    //  EVENTS
    //------------------------
    event ChangeOwnership(address caller, address newOwner, uint256 timestamp);
    event SetInfo(string info, address setter, uint256 timestamp);
    event SetWhitelistRequiredForTransfer(address caller, bool whitelistRequiredForTransfer, uint256 timestamp);
    event SetWhitelistRequiredForRevenueClaim(address caller, bool whitelistRequired, uint256 timestamp);
    event SetApprovedByIssuer(address caller, bool approvedByIssuer, uint256 timestamp);
    event CampaignWhitelist(address approver, address wallet, bool whitelisted, uint256 timestamp);
    event SetIssuerStatus(address approver, bool status, uint256 timestamp);
    event FinalizeSale(address campaign, uint256 tokenAmount, uint256 tokenValue, uint256 timestamp);
    event Liquidated(address liquidator, uint256 liquidationFunds, uint256 timestamp);
    event ClaimLiquidationShare(address indexed investor, uint256 amount,  uint256 timestamp);
    event SetChildChainManager(address caller, address oldManager, address newManager, uint256 timestamp);

    //------------------------
    //  CONSTRUCTOR
    //------------------------
    constructor(
        Structs.AssetTransferableConstructorParams memory params
    ) ERC20(params.name, params.symbol) {
        require(params.owner != address(0), "Asset: Invalid owner provided");
        require(params.issuer != address(0), "Asset: Invalid issuer provided");
        require(params.initialTokenSupply > 0, "Asset: Initial token supply can't be 0");
        require(params.childChainManager != address(0), "MirroredToken: invalid child chain manager address");
        infoHistory.push(Structs.InfoEntry(
            params.info,
            block.timestamp
        ));
        bool assetApprovedByIssuer = (IIssuer(params.issuer).getState().owner == params.owner);
        address contractAddress = address(this);
        state = Structs.AssetTransferableState(
            params.id,
            contractAddress,
            params.ansName,
            params.ansId,
            msg.sender,
            params.owner,
            params.initialTokenSupply,
            params.whitelistRequiredForRevenueClaim,
            params.whitelistRequiredForLiquidationClaim,
            assetApprovedByIssuer,
            params.issuer,
            params.apxRegistry,
            params.info,
            params.name,
            params.symbol,
            0, 0, 0,
            false,
            0, 0, 0,
            params.childChainManager
        );
        _mint(params.owner, params.initialTokenSupply);
    }

    //------------------------
    //  MODIFIERS
    //------------------------
    modifier ownerOnly() {
        require(
            msg.sender == state.owner,
            "Asset: Only asset creator can make this action."
        );
        _;
    }

    modifier notLiquidated() {
        require(!state.liquidated, "Asset: Action forbidden, asset liquidated.");
        _;
    }

    //------------------------
    //  IAsset IMPL - Write
    //------------------------
    function approveCampaign(address campaign) external override ownerOnly notLiquidated {
        _setCampaignState(campaign, true);
        emit CampaignWhitelist(msg.sender, campaign, true, block.timestamp);
    }

    function suspendCampaign(address campaign) external override ownerOnly notLiquidated {
        _setCampaignState(campaign, false);
        emit CampaignWhitelist(msg.sender, campaign, false, block.timestamp);
    }

    function changeOwnership(address newOwner) external override ownerOnly {
        state.owner = newOwner;
        emit ChangeOwnership(msg.sender, newOwner, block.timestamp);
    }

    function setInfo(string memory info) external override ownerOnly {
        infoHistory.push(Structs.InfoEntry(
            info,
            block.timestamp
        ));
        state.info = info;
        emit SetInfo(info, msg.sender, block.timestamp);
    }

    function setWhitelistRequiredForRevenueClaim(bool whitelistRequired) external override ownerOnly {
        state.whitelistRequiredForRevenueClaim = whitelistRequired;
        emit SetWhitelistRequiredForRevenueClaim(msg.sender, whitelistRequired, block.timestamp);
    }

    function setWhitelistRequiredForLiquidationClaim(bool whitelistRequired) external override ownerOnly {
        state.whitelistRequiredForLiquidationClaim = whitelistRequired;
        emit SetWhitelistRequiredForTransfer(msg.sender, whitelistRequired, block.timestamp);
    }

    function setIssuerStatus(bool status) external override {
        require(
            msg.sender == IIssuer(state.issuer).getState().owner,
            "Asset: Only issuer owner can make this action." 
        );
        state.assetApprovedByIssuer = status;
        emit SetIssuerStatus(msg.sender, status, block.timestamp);
    }
    
    function finalizeSale() external override notLiquidated {
        address campaign = msg.sender;
        require(_campaignWhitelisted(campaign), "Asset: Campaign not approved.");
        Structs.CfManagerSoftcapState memory campaignState = ICfManagerSoftcap(campaign).getState();
        require(campaignState.finalized, "Asset: Campaign not finalized");
        uint256 tokenValue = campaignState.totalFundsRaised;
        uint256 tokenAmount = campaignState.totalTokensSold;
        uint256 tokenPrice = campaignState.tokenPrice;
        require(
            tokenAmount > 0 && balanceOf(campaign) >= tokenAmount,
            "Asset: Campaign has signalled the sale finalization but campaign tokens are not present"
        );
        require(
            tokenValue > 0 && _stablecoin().balanceOf(campaign) >= tokenValue,
            "Asset: Campaign has signalled the sale finalization but raised funds are not present"
        );
        state.totalAmountRaised += tokenValue;
        state.totalTokensSold += tokenAmount;
        Structs.TokenSaleInfo memory tokenSaleInfo = Structs.TokenSaleInfo(
            campaign, tokenAmount, tokenValue, block.timestamp
        );
        sellHistory.push(tokenSaleInfo);
        successfulTokenSalesMap[campaign] = tokenSaleInfo;
        if (tokenPrice > state.highestTokenSellPrice) { state.highestTokenSellPrice = tokenPrice; }
        emit FinalizeSale(
            msg.sender,
            tokenAmount,
            tokenValue,
            block.timestamp
        );
    }

    function liquidate() external override notLiquidated ownerOnly {
        IApxAssetsRegistry apxRegistry = IApxAssetsRegistry(state.apxRegistry);
        Structs.AssetRecord memory assetRecord = apxRegistry.getMirrored(address(this));
        require(assetRecord.exists, "AssetTransferable: Not registered in Apx Registry");
        require(assetRecord.state, "AssetTransferable: Asset blocked in Apx Registry");
        require(assetRecord.mirroredToken == address(this), "AssetTransferable: Invalid mirrored asset record");
        require(block.timestamp <= assetRecord.priceValidUntil, "AssetTransferable: Price expired");
        (uint256 liquidationPrice, uint256 precision) = 
            (state.highestTokenSellPrice > assetRecord.price) ?
                (state.highestTokenSellPrice, priceDecimalsPrecision) : 
                (assetRecord.price, assetRecord.pricePrecision);
        uint256 liquidatorApprovedTokenAmount = this.allowance(msg.sender, address(this));
        uint256 liquidatorApprovedTokenValue = _tokenValue(
            liquidatorApprovedTokenAmount,
            liquidationPrice,
            precision
        );
        if (liquidatorApprovedTokenValue > 0) {
            liquidationClaimsMap[msg.sender] += liquidatorApprovedTokenValue;
            state.liquidationFundsClaimed += liquidatorApprovedTokenValue;
            this.transferFrom(msg.sender, address(this), liquidatorApprovedTokenAmount);
        }
        uint256 liquidationFundsTotal = _tokenValue(totalSupply(), liquidationPrice, precision);
        uint256 liquidationFundsToPull = liquidationFundsTotal - liquidatorApprovedTokenValue;
        if (liquidationFundsToPull > 0) {
            _stablecoin().safeTransferFrom(msg.sender, address(this), liquidationFundsToPull);
        }
        state.liquidated = true;
        state.liquidationTimestamp = block.timestamp;
        state.liquidationFundsTotal = liquidationFundsTotal;
        emit Liquidated(msg.sender, liquidationFundsTotal, block.timestamp);
    }

    function claimLiquidationShare(address investor) external override {
        require(state.liquidated, "Asset: not liquidated");
        require(
            !state.whitelistRequiredForLiquidationClaim ||
            _issuer().isWalletApproved(investor),
            "Asset: wallet must be whitelisted before claiming liquidation share."
        );
        uint256 approvedAmount = allowance(investor, address(this));
        require(approvedAmount > 0, "Asset: no tokens approved for claiming liquidation share");
        uint256 liquidationFundsShare = approvedAmount * state.liquidationFundsTotal / totalSupply();
        require(liquidationFundsShare > 0, "Asset: no liquidation funds to claim");
        liquidationClaimsMap[investor] += liquidationFundsShare;
        state.liquidationFundsClaimed += liquidationFundsShare;
        _stablecoin().safeTransfer(investor, liquidationFundsShare);
        this.transferFrom(investor, address(this), approvedAmount);
        emit ClaimLiquidationShare(investor, liquidationFundsShare, block.timestamp);
    }

    function snapshot() external override notLiquidated returns (uint256) {
        return _snapshot();
    }

    function migrateApxRegistry(address newRegistry) external override notLiquidated {
        require(msg.sender == state.apxRegistry, "AssetTransferable: Only apxRegistry can call this function.");
        state.apxRegistry = newRegistry;
    }

    function setChildChainManager(address newManager) external override ownerOnly {
        address oldManager = state.childChainManager;
        state.childChainManager = newManager;
        emit SetChildChainManager(msg.sender, oldManager, newManager, block.timestamp);
    }

    //------------------------
    //  IAsset IMPL - Read
    //------------------------
    function getState() external view override returns (Structs.AssetTransferableState memory) {
        return state;
    }

    function getIssuerAddress() external view override returns (address) { return state.issuer; }

    function getAssetFactory() external view override returns (address) { return state.createdBy; }

    function getInfoHistory() external view override returns (Structs.InfoEntry[] memory) {
        return infoHistory;
    }

    function getCampaignRecords() external view override returns (Structs.WalletRecord[] memory) {
        return approvedCampaigns;
    }

    function getSellHistory() external view override returns (Structs.TokenSaleInfo[] memory) {
        return sellHistory;
    }

    //---------------------------
    //  IChildToken IMPL - Write
    //---------------------------
    function deposit(address user, bytes calldata depositData) external override {
        require(
            msg.sender == state.childChainManager,
            "AssetTransferable: Only child chain manager can make this action."
        );
        uint256 amount = abi.decode(depositData, (uint256));
        _mint(user, amount);
    }

    function withdraw(uint256 amount) external override {
        _burn(_msgSender(), amount);
    }

    //------------------------
    //  ERC20 OVERRIDES
    //------------------------
    function balanceOf(address account) public view override returns (uint256) {
        if (state.liquidated) { return (account == state.owner) ? totalSupply() : 0; }
        return super.balanceOf(account);
    }

    //------------------------
    //  Helpers
    //------------------------
    function _stablecoin() private view returns (IERC20) {
        return IERC20(_stablecoin_address());
    }

    function _stablecoin_address() private view returns (address) {
        return _issuer().getState().stablecoin;
    }

    function _issuer() private view returns (IIssuer) {
        return IIssuer(state.issuer);
    }

    function _setCampaignState(address wallet, bool whitelisted) private {
        if (_campaignExists(wallet)) {
            approvedCampaigns[approvedCampaignsMap[wallet]].whitelisted = whitelisted;
        } else {
            approvedCampaigns.push(Structs.WalletRecord(wallet, whitelisted));
            approvedCampaignsMap[wallet] = approvedCampaigns.length - 1;
        }
    }

    function _campaignWhitelisted(address wallet) private view returns (bool) {
        if (ICfManagerSoftcap(wallet).getState().owner == state.owner) {
            return true;
        }
        return _campaignExists(wallet) && approvedCampaigns[approvedCampaignsMap[wallet]].whitelisted;
    }

    function _campaignExists(address wallet) private view returns (bool) {
        uint256 index = approvedCampaignsMap[wallet];
        if (approvedCampaigns.length == 0) { return false; }
        if (index >= approvedCampaigns.length) { return false; }
        if (approvedCampaigns[index].wallet != wallet) { return false; }
        return true;
    }

    function _tokenValue(uint256 amount, uint256 price, uint256 pricePrecision) private view returns (uint256) {
        return amount
                * price
                * _stablecoin_decimals_precision()
                / (_asset_decimals_precision() * pricePrecision);
    }

    function _stablecoin_decimals_precision() private view returns (uint256) {
        return 10 ** IToken(_stablecoin_address()).decimals();
    }

    function _asset_decimals_precision() private view returns (uint256) {
        return 10 ** decimals();
    }

}