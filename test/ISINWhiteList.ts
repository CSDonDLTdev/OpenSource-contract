import {ethers, upgrades} from "hardhat";
import {expect} from "chai";
import {ContractFactory} from "ethers";
import {
    InvestorWhitelistContractName,
    IsinPermitName,
    IsinWhitelistContractName,
    RoleManagerContractName
} from "../scripts/consts";

describe(IsinWhitelistContractName, function () {
    let isinWhiteList: any, roleManager: any, investorWhiteList: any;
    let owner: any, isinManager: any, investorManager: any, mintBurnManager: any, user: any;

    const isin = "US1234567890";

    const attributes = {
        isinType: "ES",
        name: "Company A",
        shortName: "CompA",
        issuerName: "IssuerA",
        issuerCode: "ISSA",
        cfi: "CFI001"
    };

    const modifiedAttributes = {
        isinType: "DB",
        name: "Modified Company A",
        shortName: "ModCompA",
        issuerName: "ModIssuerA",
        issuerCode: "MODISSA",
        cfi: "MODCFI001"
    };

    beforeEach(async function () {
        [owner, isinManager, investorManager, mintBurnManager, user] = await ethers.getSigners();

        const IsinPermit = await ethers.getContractFactory(IsinPermitName);
        const beacon = await upgrades.deployBeacon(IsinPermit);
        await beacon.waitForDeployment();
        const RoleManager = await ethers.getContractFactory(RoleManagerContractName);
        roleManager = await upgrades.deployProxy(RoleManager);
        await roleManager.waitForDeployment();
        const InvestorWhiteListFactory: ContractFactory = await ethers.getContractFactory(InvestorWhitelistContractName);
        investorWhiteList = await upgrades.deployProxy(InvestorWhiteListFactory, [await roleManager.getAddress()], {initializer: "initialize"});
        await investorWhiteList.waitForDeployment();
        const ISINWhiteListFactory: ContractFactory = await ethers.getContractFactory(IsinWhitelistContractName);
        isinWhiteList = await upgrades.deployProxy(ISINWhiteListFactory, [await roleManager.getAddress(), await beacon.getAddress(), await investorWhiteList.getAddress()], {initializer: "initialize"});
        await isinWhiteList.waitForDeployment();

        // Set up roles in RoleManager (simulating roles for testing)
        await roleManager.grantRole(await roleManager.ISIN_WL_MANAGER(), isinManager.address);
        await roleManager.grantRole(await roleManager.ISIN_MINT_BURN_MANAGER(), mintBurnManager.address);
        await roleManager.grantRole(await roleManager.INVESTOR_WL_MANAGER(), investorManager.address);
    });

    describe("Initialization", function () {
        it("should initialize with an empty whitelist", async function () {
            const whiteList = await isinWhiteList.listIsins();
            expect(whiteList.length).to.equal(0);
        });
    });

    describe("Add ISIN", function () {
        it("should allow a user with ISIN_WL_MANAGER to add an ISIN successfully", async function () {
            // Add ISIN
            await expect(await isinWhiteList.connect(isinManager).addIsin(
                isin,
                attributes.isinType,
                attributes.name,
                attributes.shortName,
                attributes.issuerName,
                attributes.issuerCode,
                attributes.cfi
            )).to.emit(isinWhiteList, "CreateIsin")
                .withArgs(isin,
                    () => true,
                    attributes.isinType,
                    attributes.name,
                    attributes.shortName,
                    attributes.issuerName,
                    attributes.issuerCode,
                    attributes.cfi);

            // Fetch whiteList details
            const whiteList = await isinWhiteList.listIsins();
            expect(whiteList.length).to.equal(1);
            expect(whiteList[0].isin).to.equal(isin);
            expect(whiteList[0].isinType).to.equal(attributes.isinType);
            expect(whiteList[0].name).to.equal(attributes.name);
            expect(whiteList[0].shortName).to.equal(attributes.shortName);
            expect(whiteList[0].issuerName).to.equal(attributes.issuerName);
            expect(whiteList[0].issuerCode).to.equal(attributes.issuerCode);
            expect(whiteList[0].cfi).to.equal(attributes.cfi);
            expect(whiteList[0].blocked).to.be.false;
        });

        it("should revert if ISIN already exists", async function () {
            await isinWhiteList.connect(isinManager).addIsin(
                isin,
                attributes.isinType,
                attributes.name,
                attributes.shortName,
                attributes.issuerName,
                attributes.issuerCode,
                attributes.cfi
            );

            await expect(isinWhiteList.connect(isinManager).addIsin(
                isin,
                attributes.isinType,
                attributes.name,
                attributes.shortName,
                attributes.issuerName,
                attributes.issuerCode,
                attributes.cfi
            )).to.be.revertedWithCustomError(isinWhiteList, "IsinAlreadyExists");
        });

        it("should allow adding an ISIN that has been removed", async function () {
            // Add ISIN
            await isinWhiteList.connect(isinManager).addIsin(
                isin,
                attributes.isinType,
                attributes.name,
                attributes.shortName,
                attributes.issuerName,
                attributes.issuerCode,
                attributes.cfi
            );

            await isinWhiteList.connect(isinManager).removeIsin(isin);

            await isinWhiteList.connect(isinManager).addIsin(
                isin,
                attributes.isinType,
                attributes.name,
                attributes.shortName,
                attributes.issuerName,
                attributes.issuerCode,
                attributes.cfi
            );

            // Fetch whiteList details
            const whiteList = await isinWhiteList.listIsins();
            expect(whiteList.length).to.equal(2);
            expect(whiteList[0].isin).to.equal(isin);
            expect(whiteList[0].isinType).to.equal(attributes.isinType);
            expect(whiteList[0].deleted).to.be.true;
            expect(whiteList[1].isin).to.equal(isin);
            expect(whiteList[1].isinType).to.equal(attributes.isinType);
            expect(whiteList[1].name).to.equal(attributes.name);
            expect(whiteList[1].shortName).to.equal(attributes.shortName);
            expect(whiteList[1].issuerName).to.equal(attributes.issuerName);
            expect(whiteList[1].issuerCode).to.equal(attributes.issuerCode);
            expect(whiteList[1].cfi).to.equal(attributes.cfi);
            expect(whiteList[1].deleted).to.be.false;
            expect(whiteList[1].addr).to.not.equal(whiteList[0].addr);
        });

        it("should revert if a user without ISIN_WL_MANAGER tries to add an ISIN", async function () {
            // User does not have the ISIN_WL_MANAGER
            await expect(isinWhiteList.connect(user).addIsin(
                isin,
                attributes.isinType,
                attributes.name,
                attributes.shortName,
                attributes.issuerName,
                attributes.issuerCode,
                attributes.cfi
            )).to.be.revertedWithCustomError(isinWhiteList, "UnauthorizedAccount")
                .withArgs(await user.getAddress(), roleManager.ISIN_WL_MANAGER());
        });

        it("should revert if the owner without ISIN_WL_MANAGER tries to add an ISIN", async function () {
            // Owner does not have the ISIN_WL_MANAGER
            await expect(isinWhiteList.connect(owner).addIsin(
                isin,
                attributes.isinType,
                attributes.name,
                attributes.shortName,
                attributes.issuerName,
                attributes.issuerCode,
                attributes.cfi
            )).to.be.revertedWithCustomError(isinWhiteList, "UnauthorizedAccount")
                .withArgs(await owner.getAddress(), roleManager.ISIN_WL_MANAGER());
        });
    });

    describe("Modify ISIN Attributes", function () {
        it("should allow a user with ISIN_WL_MANAGER to modify ISIN attributes", async function () {
            // Add ISIN with initial attributes
            await isinWhiteList.connect(isinManager).addIsin(
                isin,
                attributes.isinType,
                attributes.name,
                attributes.shortName,
                attributes.issuerName,
                attributes.issuerCode,
                attributes.cfi
            );

            let whiteList = await isinWhiteList.listIsins();
            // Modify ISIN attributes
            await expect(await isinWhiteList.connect(isinManager).modifyIsinAttributes(
                isin,
                modifiedAttributes.isinType,
                modifiedAttributes.name,
                modifiedAttributes.shortName,
                modifiedAttributes.issuerName,
                modifiedAttributes.issuerCode,
                modifiedAttributes.cfi
            )).to.emit(isinWhiteList, "ModifyIsinAttributes")
                .withArgs(isin,
                    whiteList[0].addr,
                    modifiedAttributes.isinType,
                    modifiedAttributes.name,
                    modifiedAttributes.shortName,
                    modifiedAttributes.issuerName,
                    modifiedAttributes.issuerCode,
                    modifiedAttributes.cfi);

            // Fetch updated ISIN details
            whiteList = await isinWhiteList.listIsins();
            expect(whiteList[0].name).to.equal(modifiedAttributes.name);
            expect(whiteList[0].shortName).to.equal(modifiedAttributes.shortName);
            expect(whiteList[0].issuerName).to.equal(modifiedAttributes.issuerName);
            expect(whiteList[0].issuerCode).to.equal(modifiedAttributes.issuerCode);
            expect(whiteList[0].cfi).to.equal(modifiedAttributes.cfi);
        });

        it("should revert if ISIN does not exist", async function () {
            await expect(
                isinWhiteList.connect(isinManager).modifyIsinAttributes(
                    isin,
                    modifiedAttributes.isinType,
                    modifiedAttributes.name,
                    modifiedAttributes.shortName,
                    modifiedAttributes.issuerName,
                    modifiedAttributes.issuerCode,
                    modifiedAttributes.cfi
                )
            ).to.be.revertedWithCustomError(isinWhiteList, "IsinNotFound");
        });

        it("should revert if a user without ISIN_WL_MANAGER tries to modify ISIN attributes", async function () {
            // Add ISIN with initial attributes
            await isinWhiteList.connect(isinManager).addIsin(
                isin,
                attributes.isinType,
                attributes.name,
                attributes.shortName,
                attributes.issuerName,
                attributes.issuerCode,
                attributes.cfi
            );

            // Attempt to modify ISIN attributes without the required role
            await expect(
                isinWhiteList.connect(user).modifyIsinAttributes(
                    isin,
                    modifiedAttributes.isinType,
                    modifiedAttributes.name,
                    modifiedAttributes.shortName,
                    modifiedAttributes.issuerName,
                    modifiedAttributes.issuerCode,
                    modifiedAttributes.cfi
                )
            ).to.be.revertedWithCustomError(isinWhiteList, "UnauthorizedAccount")
                .withArgs(await user.getAddress(), roleManager.ISIN_WL_MANAGER());
        });

        it("should revert if the owner without ISIN_WL_MANAGER tries to modify ISIN attributes", async function () {
            // Add ISIN with initial attributes
            await isinWhiteList.connect(isinManager).addIsin(
                isin,
                attributes.isinType,
                attributes.name,
                attributes.shortName,
                attributes.issuerName,
                attributes.issuerCode,
                attributes.cfi
            );

            // Attempt to modify ISIN attributes without the required role
            await expect(
                isinWhiteList.connect(owner).modifyIsinAttributes(
                    isin,
                    modifiedAttributes.isinType,
                    modifiedAttributes.name,
                    modifiedAttributes.shortName,
                    modifiedAttributes.issuerName,
                    modifiedAttributes.issuerCode,
                    modifiedAttributes.cfi
                )
            ).to.be.revertedWithCustomError(isinWhiteList, "UnauthorizedAccount")
                .withArgs(await owner.getAddress(), roleManager.ISIN_WL_MANAGER());
        });
    });

    describe("Remove ISIN", function () {
        it("should allow a user with ISIN_WL_MANAGER to remove an ISIN successfully", async function () {
            await isinWhiteList.connect(isinManager).addIsin(
                isin,
                attributes.isinType,
                attributes.name,
                attributes.shortName,
                attributes.issuerName,
                attributes.issuerCode,
                attributes.cfi
            );
            let whiteList = await isinWhiteList.listIsins();
            await expect(await isinWhiteList.connect(isinManager).removeIsin(isin))
                .to.emit(isinWhiteList, "DeleteIsin")
                .withArgs(isin, whiteList[0].addr);

            whiteList = await isinWhiteList.listIsins();
            expect(whiteList.length).to.equal(1);
            expect(whiteList[0].isin).to.equal(isin);
            expect(whiteList[0].isinType).to.equal(attributes.isinType);
            expect(whiteList[0].deleted).to.be.true;
        });

        it("should revert if trying to remove an ISIN with non-zero total supply", async function () {
            await isinWhiteList.connect(isinManager).addIsin(
                isin,
                attributes.isinType,
                attributes.name,
                attributes.shortName,
                attributes.issuerName,
                attributes.issuerCode,
                attributes.cfi
            );

            const whiteList = await isinWhiteList.listIsins();
            const addr = whiteList[0].addr;
            const isinPermit = await ethers.getContractAt(IsinPermitName, addr);
            await investorWhiteList.connect(investorManager).addInvestor(user.address, "asdf");
            await investorWhiteList.connect(investorManager).addAllowedIsinType(user.address, "ES");
            await investorWhiteList.connect(investorManager).addInvestor(isinManager.address, "asdf");
            await investorWhiteList.connect(investorManager).addAllowedIsinType(isinManager.address, "ES");
            await isinPermit.connect(mintBurnManager).mint(user.address, 100);
            await isinPermit.connect(mintBurnManager).mint(isinManager.address, 20);

            await expect(isinWhiteList.connect(isinManager).removeIsin(isin))
                .to.be.revertedWithCustomError(isinWhiteList, "IsinNonZeroTotalSupply")
                .withArgs(addr, 120);
        });

        it("should revert if ISIN does not exist", async function () {
            const isin = "US1234567890";
            await expect(isinWhiteList.connect(isinManager).removeIsin(isin))
                .to.be.revertedWithCustomError(isinWhiteList, "IsinNotFound");
        });

        it("should revert if a user without ISIN_WL_MANAGER tries to remove ISIN", async function () {
            await isinWhiteList.connect(isinManager).addIsin(
                isin,
                attributes.isinType,
                attributes.name,
                attributes.shortName,
                attributes.issuerName,
                attributes.issuerCode,
                attributes.cfi
            );

            // user does not have the ISIN_WL_MANAGER
            await expect(isinWhiteList.connect(user).removeIsin(isin))
                .to.be.revertedWithCustomError(isinWhiteList, "UnauthorizedAccount")
                .withArgs(await user.getAddress(), roleManager.ISIN_WL_MANAGER());
        });

        it("should revert if the owner without ISIN_WL_MANAGER tries to remove ISIN", async function () {
            await isinWhiteList.connect(isinManager).addIsin(
                isin,
                attributes.isinType,
                attributes.name,
                attributes.shortName,
                attributes.issuerName,
                attributes.issuerCode,
                attributes.cfi
            );

            // owner does not have the ISIN_WL_MANAGER
            await expect(isinWhiteList.connect(owner).removeIsin(isin))
                .to.be.revertedWithCustomError(isinWhiteList, "UnauthorizedAccount")
                .withArgs(await owner.getAddress(), roleManager.ISIN_WL_MANAGER());
        });
    });

    describe("Block/Unblock ISIN", function () {
        it("should allow a user with ISIN_WL_MANAGER to block/unblock an ISIN", async function () {
            await isinWhiteList.connect(isinManager).addIsin(
                isin,
                attributes.isinType,
                attributes.name,
                attributes.shortName,
                attributes.issuerName,
                attributes.issuerCode,
                attributes.cfi
            );

            const whiteList = await isinWhiteList.listIsins();
            await expect(await isinWhiteList.connect(isinManager).blockIsin(isin))
                .to.emit(isinWhiteList, "BlockIsin")
                .withArgs(isin, whiteList[0].addr);
            let isBlocked = await isinWhiteList.isIsinBlocked(isin);
            expect(isBlocked).to.be.true;

            await expect(await isinWhiteList.connect(isinManager).unblockIsin(isin))
                .to.emit(isinWhiteList, "UnblockIsin")
                .withArgs(isin, whiteList[0].addr);
            isBlocked = await isinWhiteList.isIsinBlocked(isin);
            expect(isBlocked).to.be.false;
        });

        it("should revert if trying to block/unblock a non-existent ISIN", async function () {
            await expect(isinWhiteList.connect(isinManager).blockIsin(isin))
                .to.be.revertedWithCustomError(isinWhiteList, "IsinNotFound");

            await expect(isinWhiteList.connect(isinManager).unblockIsin(isin))
                .to.be.revertedWithCustomError(isinWhiteList, "IsinNotFound");
        });

        it("should revert if trying to block/unblock a removed ISIN", async function () {
            await isinWhiteList.connect(isinManager).addIsin(
                isin,
                attributes.isinType,
                attributes.name,
                attributes.shortName,
                attributes.issuerName,
                attributes.issuerCode,
                attributes.cfi
            );

            await isinWhiteList.connect(isinManager).removeIsin(isin);

            await expect(isinWhiteList.connect(isinManager).blockIsin(isin))
                .to.be.revertedWithCustomError(isinWhiteList, "IsinNotFound");

            await expect(isinWhiteList.connect(isinManager).unblockIsin(isin))
                .to.be.revertedWithCustomError(isinWhiteList, "IsinNotFound");
        });

        it("should revert if a user without ISIN_WL_MANAGER tries to block/unblock ISIN", async function () {
            await isinWhiteList.connect(isinManager).addIsin(
                isin,
                attributes.isinType,
                attributes.name,
                attributes.shortName,
                attributes.issuerName,
                attributes.issuerCode,
                attributes.cfi
            );

            // user does not have the ISIN_WL_MANAGER
            await expect(isinWhiteList.connect(user).blockIsin(isin))
                .to.be.revertedWithCustomError(isinWhiteList, "UnauthorizedAccount")
                .withArgs(await user.getAddress(), roleManager.ISIN_WL_MANAGER());

            await expect(isinWhiteList.connect(user).unblockIsin(isin))
                .to.be.revertedWithCustomError(isinWhiteList, "UnauthorizedAccount")
                .withArgs(await user.getAddress(), roleManager.ISIN_WL_MANAGER());
        });

        it("should revert if the owner without ISIN_WL_MANAGER tries to block/unblock ISIN", async function () {
            await isinWhiteList.connect(isinManager).addIsin(
                isin,
                attributes.isinType,
                attributes.name,
                attributes.shortName,
                attributes.issuerName,
                attributes.issuerCode,
                attributes.cfi
            );

            // owner does not have the ISIN_WL_MANAGER
            await expect(isinWhiteList.connect(owner).blockIsin(isin))
                .to.be.revertedWithCustomError(isinWhiteList, "UnauthorizedAccount")
                .withArgs(await owner.getAddress(), roleManager.ISIN_WL_MANAGER());

            await expect(isinWhiteList.connect(owner).unblockIsin(isin))
                .to.be.revertedWithCustomError(isinWhiteList, "UnauthorizedAccount")
                .withArgs(await owner.getAddress(), roleManager.ISIN_WL_MANAGER());
        });
    });

    describe("List ISINs", function () {
        it("should list all ISINs with their attributes", async function () {
            const isin2 = "US9876543210";
            const isin3 = "US9876543211";

            // Defining the additional attributes
            const attributes2 = {
                isinType: "DB",
                name: "Company B",
                shortName: "CompB",
                issuerName: "IssuerB",
                issuerCode: "ISSB",
                cfi: "CFI002"
            };

            const attributes3 = {
                isinType: "DB",
                name: "Company C",
                shortName: "CompC",
                issuerName: "IssuerC",
                issuerCode: "ISSC",
                cfi: "CFI003"
            };

            // Adding ISINs with attributes
            await isinWhiteList.connect(isinManager).addIsin(
                isin,
                attributes.isinType,
                attributes.name,
                attributes.shortName,
                attributes.issuerName,
                attributes.issuerCode,
                attributes.cfi
            );
            await isinWhiteList.connect(isinManager).addIsin(
                isin2,
                attributes2.isinType,
                attributes2.name,
                attributes2.shortName,
                attributes2.issuerName,
                attributes2.issuerCode,
                attributes2.cfi
            );
            await isinWhiteList.connect(isinManager).addIsin(
                isin3,
                attributes3.isinType,
                attributes3.name,
                attributes3.shortName,
                attributes3.issuerName,
                attributes3.issuerCode,
                attributes3.cfi
            );

            // block isin
            await isinWhiteList.connect(isinManager).blockIsin(isin);
            // remove isin2
            await isinWhiteList.connect(isinManager).removeIsin(isin2);
            // block/unblock isin3
            await isinWhiteList.connect(isinManager).blockIsin(isin3);
            await isinWhiteList.connect(isinManager).unblockIsin(isin3);

            const whiteList = await isinWhiteList.listIsins();

            expect(whiteList.length).to.equal(3);

            // Checking the first ISIN entry
            expect(whiteList[0].isin).to.equal(isin);
            expect(whiteList[0].isinType).to.equal(attributes.isinType);
            expect(whiteList[0].blocked).to.equal(true);
            expect(whiteList[0].deleted).to.equal(false);
            expect(whiteList[0].name).to.equal(attributes.name);
            expect(whiteList[0].shortName).to.equal(attributes.shortName);
            expect(whiteList[0].issuerName).to.equal(attributes.issuerName);
            expect(whiteList[0].issuerCode).to.equal(attributes.issuerCode);
            expect(whiteList[0].cfi).to.equal(attributes.cfi);

            // Checking the second ISIN entry
            expect(whiteList[1].isin).to.equal(isin2);
            expect(whiteList[1].isinType).to.equal(attributes2.isinType);
            expect(whiteList[1].blocked).to.equal(false);
            expect(whiteList[1].deleted).to.equal(true);
            expect(whiteList[1].name).to.equal(attributes2.name);
            expect(whiteList[1].shortName).to.equal(attributes2.shortName);
            expect(whiteList[1].issuerName).to.equal(attributes2.issuerName);
            expect(whiteList[1].issuerCode).to.equal(attributes2.issuerCode);
            expect(whiteList[1].cfi).to.equal(attributes2.cfi);

            // Checking the third ISIN entry
            expect(whiteList[2].isin).to.equal(isin3);
            expect(whiteList[2].isinType).to.equal(attributes3.isinType);
            expect(whiteList[2].blocked).to.equal(false);
            expect(whiteList[2].deleted).to.equal(false);
            expect(whiteList[2].name).to.equal(attributes3.name);
            expect(whiteList[2].shortName).to.equal(attributes3.shortName);
            expect(whiteList[2].issuerName).to.equal(attributes3.issuerName);
            expect(whiteList[2].issuerCode).to.equal(attributes3.issuerCode);
            expect(whiteList[2].cfi).to.equal(attributes3.cfi);
        });
    });

    describe("Assert transfer allowed", function () {
        it("should return ISIN type for existing non-blocked ISINs", async function () {
            // Adding ISINs with attributes
            await isinWhiteList.connect(isinManager).addIsin(
                isin,
                attributes.isinType,
                attributes.name,
                attributes.shortName,
                attributes.issuerName,
                attributes.issuerCode,
                attributes.cfi
            );

            // block/unblock isin
            await isinWhiteList.connect(isinManager).blockIsin(isin);
            await isinWhiteList.connect(isinManager).unblockIsin(isin);

            expect(await isinWhiteList.assertTransferAllowed(isin)).to.equal(attributes.isinType);

            // Modify ISIN attributes
            await isinWhiteList.connect(isinManager).modifyIsinAttributes(
                isin,
                modifiedAttributes.isinType,
                modifiedAttributes.name,
                modifiedAttributes.shortName,
                modifiedAttributes.issuerName,
                modifiedAttributes.issuerCode,
                modifiedAttributes.cfi
            );

            expect(await isinWhiteList.assertTransferAllowed(isin)).to.equal(modifiedAttributes.isinType);

        });

        it("should revert for non-existent ISINs", async function () {
            await expect(isinWhiteList.assertTransferAllowed(isin)).to.be.revertedWithCustomError(isinWhiteList, "IsinNotFound");

            // Adding ISINs with attributes
            await isinWhiteList.connect(isinManager).addIsin(
                isin,
                attributes.isinType,
                attributes.name,
                attributes.shortName,
                attributes.issuerName,
                attributes.issuerCode,
                attributes.cfi
            );

            await isinWhiteList.connect(isinManager).removeIsin(isin);

            await expect(isinWhiteList.assertTransferAllowed(isin)).to.be.revertedWithCustomError(isinWhiteList, "IsinNotFound");
        });

        it("should revert for blocked ISINs", async function () {
            // Adding ISINs with attributes
            await isinWhiteList.connect(isinManager).addIsin(
                isin,
                attributes.isinType,
                attributes.name,
                attributes.shortName,
                attributes.issuerName,
                attributes.issuerCode,
                attributes.cfi
            );

            await isinWhiteList.connect(isinManager).blockIsin(isin);

            await expect(isinWhiteList.assertTransferAllowed(isin)).to.be.revertedWithCustomError(isinWhiteList, "IsinBlocked");
        });
    });
});
