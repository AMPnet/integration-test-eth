// @ts-ignore
import { ethers } from "hardhat";
import { Contract, Signer } from "ethers";
import { expect } from "chai";
import * as helpers from "../util/helpers";
import { it } from "mocha";

import * as docker from "../util/docker";
import * as userService from "../util/user-service";

describe("Whitelist user address", function () {

    //////// FACTORIES ////////
    let issuerFactory: Contract;

    //////// SERVICES ////////
    let walletApproverService: Contract;
    let deployerService: Contract;
    let queryService: Contract;

    //////// SIGNERS ////////
    let deployer: Signer;
    let issuerOwner: Signer;
    let alice: Signer;
    let jane: Signer;
    let frank: Signer;
    let walletApprover: Signer;

    //////// CONTRACTS ////////
    let stablecoin: Contract;
    let issuer: Contract;

    // TODO: use when docker util is ready
    // before(async function () {
    //     await docker.up();
    // })

    beforeEach(async function () {
        const accounts: Signer[] = await ethers.getSigners();
        deployer        = accounts[0];
        issuerOwner     = accounts[1];
        alice           = accounts[3];
        jane            = accounts[4];
        frank           = accounts[5];
        walletApprover  = accounts[6];

        stablecoin = await helpers.deployStablecoin(deployer, "1000000000000");
        issuerFactory = await helpers.deployIssuerFactory(deployer);
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
        const issuerAnsName = "test-issuer";
        const issuerInfoHash = "issuer-info-ipfs-hash";
        const issuerOwnerAddress = await issuerOwner.getAddress();

        //// Deploy the contracts with the provided config
        issuer = await helpers.createIssuer(
            issuerOwnerAddress,
            issuerAnsName,
            stablecoin,
            walletApproverService.address,
            issuerInfoHash,
            issuerFactory
        );

        const accounts: Signer[] = await ethers.getSigners();
        const frank = accounts[5]
        const franksAddress = await frank.getAddress()
        const payload = await userService.getPayload(franksAddress)
        const accessToken = await userService.getAccessToken(franksAddress, await frank.signMessage(payload))
        await userService.completeKyc(accessToken, franksAddress)
        await userService.whitelistAddress(accessToken, issuer.address, await frank.getChainId())

        await new Promise(f => setTimeout(f, 5000));
        const isWalletApproved = await issuer.isWalletApproved(franksAddress)
        console.log("response: ", isWalletApproved)
        expect(isWalletApproved).to.be.true
    })

    // TODO: use when docker util is ready
    // after(async function () {
    //     await docker.down();
    // })
})
