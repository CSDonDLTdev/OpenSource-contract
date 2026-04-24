import {expect} from "chai";
import {ethers, upgrades} from "hardhat";
import {RoleManagerContractName} from "../scripts/consts";

describe("RoleManager Contract", function () {
    let roleManager: any;
    let owner: any;
    let otherAccount: any;
    let anotherAccount: any;
    const ISIN_WL_MANAGER = ethers.keccak256(ethers.toUtf8Bytes("ISIN_WL_MANAGER"));
    const INVESTOR_WL_MANAGER = ethers.keccak256(ethers.toUtf8Bytes("INVESTOR_WL_MANAGER"));
    const ISIN_MINT_BURN_MANAGER = ethers.keccak256(ethers.toUtf8Bytes("ISIN_MINT_BURN_MANAGER"));

    before(async function () {
        [owner, otherAccount, anotherAccount] = await ethers.getSigners();
    });

    beforeEach(async function () {
        const RoleManager = await ethers.getContractFactory(RoleManagerContractName, owner);
        roleManager = await upgrades.deployProxy(RoleManager, [], {initializer: "initialize"});
        await roleManager.waitForDeployment();
    });

    it("Should initialize with the owner as DEFAULT_ADMIN_ROLE", async function () {
        const isAdmin = await roleManager.hasRole(await roleManager.DEFAULT_ADMIN_ROLE(), await owner.address);
        expect(isAdmin).to.be.true;
    });

    it("Should allow the owner to grant roles", async function () {
        await roleManager.connect(owner).grantRole(ISIN_WL_MANAGER, otherAccount.address);
        await roleManager.connect(owner).grantRole(INVESTOR_WL_MANAGER, otherAccount.address);
        await roleManager.connect(owner).grantRole(ISIN_MINT_BURN_MANAGER, otherAccount.address);
        expect(await roleManager.hasRole(ISIN_WL_MANAGER, otherAccount.address)).to.be.true;
        expect(await roleManager.hasRole(INVESTOR_WL_MANAGER, otherAccount.address)).to.be.true;
        expect(await roleManager.hasRole(ISIN_MINT_BURN_MANAGER, otherAccount.address)).to.be.true;
    });

    it("Should not allow non-owner to grant roles", async function () {
        await expect(
            roleManager.connect(otherAccount).grantRole(ISIN_WL_MANAGER, anotherAccount.address)
        ).to.be.revertedWithCustomError(roleManager, "OwnableUnauthorizedAccount").withArgs(otherAccount.address);
        await expect(
            roleManager.connect(otherAccount).grantRole(INVESTOR_WL_MANAGER, anotherAccount.address)
        ).to.be.revertedWithCustomError(roleManager, "OwnableUnauthorizedAccount").withArgs(otherAccount.address);
        await expect(
            roleManager.connect(otherAccount).grantRole(ISIN_MINT_BURN_MANAGER, anotherAccount.address)
        ).to.be.revertedWithCustomError(roleManager, "OwnableUnauthorizedAccount").withArgs(otherAccount.address);
    });

    it("Should allow the owner to revoke roles", async function () {
        await roleManager.connect(owner).grantRole(ISIN_WL_MANAGER, otherAccount.address);
        await roleManager.connect(owner).grantRole(INVESTOR_WL_MANAGER, otherAccount.address);
        await roleManager.connect(owner).grantRole(ISIN_MINT_BURN_MANAGER, otherAccount.address);
        await roleManager.connect(owner).revokeRole(ISIN_WL_MANAGER, otherAccount.address);
        await roleManager.connect(owner).revokeRole(INVESTOR_WL_MANAGER, otherAccount.address);
        await roleManager.connect(owner).revokeRole(ISIN_MINT_BURN_MANAGER, otherAccount.address);
        expect(await roleManager.hasRole(ISIN_WL_MANAGER, otherAccount.address)).to.be.false;
        expect(await roleManager.hasRole(INVESTOR_WL_MANAGER, otherAccount.address)).to.be.false;
        expect(await roleManager.hasRole(ISIN_MINT_BURN_MANAGER, otherAccount.address)).to.be.false;
    });

    it("Should not allow non-owner to revoke roles", async function () {
        await roleManager.connect(owner).grantRole(ISIN_WL_MANAGER, otherAccount.address);
        await roleManager.connect(owner).grantRole(INVESTOR_WL_MANAGER, otherAccount.address);
        await roleManager.connect(owner).grantRole(ISIN_MINT_BURN_MANAGER, otherAccount.address);
        await expect(
            roleManager.connect(otherAccount).revokeRole(ISIN_WL_MANAGER, anotherAccount.address)
        ).to.be.revertedWithCustomError(roleManager, "OwnableUnauthorizedAccount").withArgs(otherAccount.address);
        await expect(
            roleManager.connect(otherAccount).revokeRole(INVESTOR_WL_MANAGER, anotherAccount.address)
        ).to.be.revertedWithCustomError(roleManager, "OwnableUnauthorizedAccount").withArgs(otherAccount.address);
        await expect(
            roleManager.connect(otherAccount).revokeRole(ISIN_MINT_BURN_MANAGER, anotherAccount.address)
        ).to.be.revertedWithCustomError(roleManager, "OwnableUnauthorizedAccount").withArgs(otherAccount.address);
    });

});
