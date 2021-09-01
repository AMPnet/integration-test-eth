// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./IApxAssetsRegistry.sol";
import "../asset/IAsset.sol";
import "../shared/Structs.sol";

contract ApxAssetsRegistry is IApxAssetsRegistry {

    //------------------------
    //  STATE
    //------------------------
    address public masterOwner;
    address public assetManager;
    address public priceManager;
    mapping (address => Structs.AssetRecord) private assets;
    mapping (address => address) private originalToMirrored;
    address[] private assetsList;

    //------------------------
    //  EVENTS
    //------------------------
    event RegisterAsset(address caller, address original, address mirrored, bool state, uint256 timestamp);
    event UpdatePrice(address priceManager, address asset, uint256 price, uint256 expiry, uint256 timestamp);
    event UpdateState(address assetManager, address asset, bool active, uint256 timestamp);
    event TransferMasterOwnerRole(address oldMasterOwner, address newMasterOwner, uint256 timestamp);
    event TransferAssetManagerRole(address oldAssetManager, address newAssetManager, uint256 timestamp);
    event TransferPriceManagerRole(address oldPriceManager, address newPriceManager, uint256 timestamp);
    event Migrate(address calller, address newAssetsRegistry, address originalAsset, uint256 timestamp);

    //------------------------
    //  CONSTRUCTOR
    //------------------------
    constructor(address _masterOwner, address _assetManager, address _priceManager) {
        masterOwner = _masterOwner;
        assetManager = _assetManager;
        priceManager = _priceManager;
    }

    //------------------------
    //  MODIFIERS
    //------------------------
    modifier onlyMasterOwner() {
        require(msg.sender == masterOwner, "ApxAssetsRegistry: Only master owner can call this function.");
        _;
    }

    modifier onlyAssetManagerOrMasterOwner() {
        require(
            msg.sender == assetManager || msg.sender == masterOwner,
            "ApxAssetsRegistry: Only asset manager or master owner can call this function."
        );
        _;
    }

    modifier onlyPriceManagerOrMasterOwner() {
        require(
            msg.sender == priceManager || msg.sender == masterOwner,
            "ApxAssetsRegistry: Only price manager or master owner can call this function."
        );
        _;
    }

    modifier assetExists(address asset) {
        require(assets[asset].exists, "ApxAssetsRegistry: Asset does not exist.");
        _;
    }

    //---------------------------------
    //  IApxAssetsRegistry IMPL - Write
    //---------------------------------
    function transferMasterOwnerRole(address newMasterOwner) external override onlyMasterOwner {
        masterOwner = newMasterOwner;
        emit TransferMasterOwnerRole(msg.sender, newMasterOwner, block.timestamp);
    }

    function transferAssetManagerRole(address newAssetManager) external override onlyAssetManagerOrMasterOwner {
        assetManager = newAssetManager;
        emit TransferAssetManagerRole(msg.sender, newAssetManager, block.timestamp);
    }

    function transferPriceManagerRole(address newPriceManager) external override onlyPriceManagerOrMasterOwner {
        priceManager = newPriceManager;
        emit TransferPriceManagerRole(msg.sender, newPriceManager, block.timestamp);
    }

    function registerAsset(
        address original,
        address mirrored,
        bool state
    ) external override onlyAssetManagerOrMasterOwner {
        require(
            !assets[mirrored].exists ||
            IERC20(assets[mirrored].mirroredToken).totalSupply() == 0,
            "ApxAssetsRegistry: Mirrored asset already exists and is in circulation. Can't overwrite."
        );
        require(
            original == mirrored || IERC20(mirrored).totalSupply() == 0,
            "ApxAssetsRegistry: Mirrored asset provided should have initial supply 0."
        );
        originalToMirrored[original] = mirrored;
        assets[mirrored] = Structs.AssetRecord(
            original,
            mirrored,
            true,
            state,
            block.timestamp,
            0, 0, 0, 0, address(0)
        );
        assetsList.push(mirrored);
        emit RegisterAsset(msg.sender, original, mirrored, state, block.timestamp);
    }

    function updateState(
        address asset,
        bool state
    ) external override onlyAssetManagerOrMasterOwner assetExists(asset) {
        assets[asset].state = state;
        assets[asset].stateUpdatedAt = block.timestamp;
        emit UpdateState(msg.sender, asset, state, block.timestamp);
    }

    function updatePrice(
        address asset,
        uint256 price,
        uint256 pricePrecision,
        uint256 expiry
    ) external override onlyPriceManagerOrMasterOwner assetExists(asset) {
        require(assets[asset].state, "ApxAssetsRegistry: Can update price for approved assets only.");
        require(price > 0, "MirroredToken: price has to be > 0;");
        require(expiry > 0, "MirroredToken: expiry has to be > 0;");
        assets[asset].price = price;
        assets[asset].pricePrecision = pricePrecision;
        assets[asset].priceUpdatedAt = block.timestamp;
        assets[asset].priceValidUntil = block.timestamp + expiry;
        assets[asset].priceProvider = msg.sender;
        emit UpdatePrice(msg.sender, asset, price, expiry, block.timestamp);
    }

    function migrate(address newAssetsRegistry, address originalAsset) external override onlyMasterOwner {
        require(newAssetsRegistry != address(0), "ApxAssetsRegistry: Invalid apxRegistry address");
        require(originalAsset != address(0), "ApxAssetsRegistry: Invalid originalAsset address");
        require(
            originalToMirrored[originalAsset] == 
            IApxAssetsRegistry(newAssetsRegistry).getMirroredFromOriginal(originalAsset).mirroredToken,
            "ApxAssetsRegistry: Mirrored tokens in the new and old registry differ."
        );
        IAsset(originalAsset).migrateApxRegistry(newAssetsRegistry);
        emit Migrate(msg.sender, newAssetsRegistry, originalAsset, block.timestamp);
    }

    //---------------------------------
    //  IApxAssetsRegistry IMPL - Read
    //---------------------------------
    function getMirrored(address asset) external view override returns (Structs.AssetRecord memory) {
        return assets[asset];
    }

    function getMirroredFromOriginal(address original) external view override returns (Structs.AssetRecord memory) {
        return assets[originalToMirrored[original]];
    }

    function getMirroredList() external view override returns (address[] memory) {
        return assetsList;
    }

}