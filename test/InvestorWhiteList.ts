import {ethers, upgrades} from "hardhat";
import {expect} from "chai";
import {ContractFactory} from "ethers";
import {InvestorWhitelistContractName, RoleManagerContractName} from "../scripts/consts";

describe(InvestorWhitelistContractName, function () {
    let investorWhiteList: any;
    let roleManager: any;
    let owner: any;
    let apiManager: any;
    let user: any;
    let investor: any;
    let investor2: any;
    let investor3: any;

    const attributes = {
        investorType: "abcd"
    };

    const modifiedAttributes = {
        investorType: "efgh"
    };
    const isinType1 = "ES";
    const isinType2 = "DB";

    beforeEach(async function () {
        let investorSigner, investor2Signer, investor3Signer: any;
        [owner, apiManager, user, investorSigner, investor2Signer, investor3Signer] = await ethers.getSigners();
        investor = await investorSigner.getAddress();
        investor2 = await investor2Signer.getAddress();
        investor3 = await investor3Signer.getAddress();

        const RoleManager = await ethers.getContractFactory(RoleManagerContractName);
        roleManager = await upgrades.deployProxy(RoleManager);
        await roleManager.waitForDeployment();

        const InvestorWhiteListFactory: ContractFactory = await ethers.getContractFactory(InvestorWhitelistContractName);
        investorWhiteList = await upgrades.deployProxy(InvestorWhiteListFactory, [await roleManager.getAddress()], {initializer: "initialize"});
        await investorWhiteList.waitForDeployment();

        // Set up roles in RoleManager (simulating roles for testing)
        await roleManager.grantRole(await roleManager.INVESTOR_WL_MANAGER(), apiManager.address);
    });

    describe("Initialization", function () {
        it("should initialize with an empty whitelist", async function () {
            const whiteList = await investorWhiteList.listInvestors();
            expect(whiteList.length).to.equal(0);
        });
    });

    describe("Add Investor", function () {
        it("should allow a user with INVESTOR_WL_MANAGER to add an Investor successfully", async function () {
            // Add Investor
            await investorWhiteList.connect(apiManager).addInvestor(investor, attributes.investorType);

            // Fetch whiteList details
            const whiteList = await investorWhiteList.listInvestors();
            expect(whiteList.length).to.equal(1);
            expect(whiteList[0].wallet).to.equal(investor);
            expect(whiteList[0].investorType).to.equal(attributes.investorType);
            expect(whiteList[0].blocked).to.be.false;
        });

        it("should revert if Investor already exists", async function () {
            await investorWhiteList.connect(apiManager).addInvestor(investor, attributes.investorType);

            await expect(investorWhiteList.connect(apiManager).addInvestor(
                investor,
                attributes.investorType
            )).to.be.revertedWithCustomError(investorWhiteList, "InvestorAlreadyExists").withArgs(investor);
        });

        it("should allow adding an Investor that has been removed", async function () {
            // Add Investor
            await investorWhiteList.connect(apiManager).addInvestor(investor, attributes.investorType);

            await investorWhiteList.connect(apiManager).removeInvestor(investor);

            await investorWhiteList.connect(apiManager).addInvestor(investor, attributes.investorType);

            // Fetch whiteList details
            const whiteList = await investorWhiteList.listInvestors();
            expect(whiteList.length).to.equal(2);
            expect(whiteList[0].wallet).to.equal(investor);
            expect(whiteList[0].investorType).to.equal(attributes.investorType);
            expect(whiteList[0].deleted).to.be.true;
            expect(whiteList[1].wallet).to.equal(investor);
            expect(whiteList[1].investorType).to.equal(attributes.investorType);
            expect(whiteList[1].deleted).to.be.false;
        });

        it("should revert if a user without INVESTOR_WL_MANAGER tries to add an Investor", async function () {
            // User does not have the INVESTOR_WL_MANAGER
            await expect(investorWhiteList.connect(user).addInvestor(
                investor,
                attributes.investorType
            )).to.be.revertedWithCustomError(investorWhiteList, "UnauthorizedAccount")
                .withArgs(await user.getAddress(), roleManager.INVESTOR_WL_MANAGER());
        });

        it("should revert if the owner without INVESTOR_WL_MANAGER tries to add an Investor", async function () {
            // Owner does not have the INVESTOR_WL_MANAGER
            await expect(investorWhiteList.connect(owner).addInvestor(investor, attributes.investorType)).to.be
                .revertedWithCustomError(investorWhiteList, "UnauthorizedAccount")
                .withArgs(await owner.getAddress(), roleManager.INVESTOR_WL_MANAGER());
        });
    });

    describe("Modify Investor Attributes", function () {
        it("should allow a user with INVESTOR_WL_MANAGER to modify Investor attributes", async function () {
            // Add Investor with initial attributes
            await investorWhiteList.connect(apiManager).addInvestor(investor, attributes.investorType);

            // Modify Investor attributes
            await investorWhiteList.connect(apiManager).modifyInvestorAttributes(
                investor,
                modifiedAttributes.investorType
            );

            // Fetch updated Investor details
            const whiteList = await investorWhiteList.listInvestors();
            expect(whiteList[0].investorType).to.equal(modifiedAttributes.investorType);
        });

        it("should revert if Investor does not exist", async function () {
            await expect(
                investorWhiteList.connect(apiManager).modifyInvestorAttributes(
                    investor,
                    modifiedAttributes.investorType
                )
            ).to.be.revertedWithCustomError(investorWhiteList, "InvestorNotFound").withArgs(investor);
        });

        it("should revert if a user without INVESTOR_WL_MANAGER tries to modify Investor attributes", async function () {
            // Add Investor with initial attributes
            await investorWhiteList.connect(apiManager).addInvestor(investor, attributes.investorType);

            // Attempt to modify Investor attributes without the required role
            await expect(
                investorWhiteList.connect(user).modifyInvestorAttributes(
                    investor,
                    modifiedAttributes.investorType
                )
            ).to.be.revertedWithCustomError(investorWhiteList, "UnauthorizedAccount")
                .withArgs(await user.getAddress(), roleManager.INVESTOR_WL_MANAGER());
        });

        it("should revert if the owner without INVESTOR_WL_MANAGER tries to modify Investor attributes", async function () {
            // Add Investor with initial attributes
            await investorWhiteList.connect(apiManager).addInvestor(investor, attributes.investorType);

            // Attempt to modify Investor attributes without the required role
            await expect(
                investorWhiteList.connect(owner).modifyInvestorAttributes(
                    investor,
                    modifiedAttributes.investorType
                )
            ).to.be.revertedWithCustomError(investorWhiteList, "UnauthorizedAccount")
                .withArgs(await owner.getAddress(), roleManager.INVESTOR_WL_MANAGER());
        });
    });

    describe("Remove Investor", function () {
        it("should allow a user with INVESTOR_WL_MANAGER to remove an Investor successfully", async function () {
            await investorWhiteList.connect(apiManager).addInvestor(investor, attributes.investorType);
            await investorWhiteList.connect(apiManager).removeInvestor(investor);

            const whiteList = await investorWhiteList.listInvestors();
            expect(whiteList.length).to.equal(1);
            expect(whiteList[0].wallet).to.equal(investor);
            expect(whiteList[0].investorType).to.equal(attributes.investorType);
            expect(whiteList[0].deleted).to.be.true;
        });

        it("should revert if Investor does not exist", async function () {
            await expect(investorWhiteList.connect(apiManager).removeInvestor(investor))
                .to.be.revertedWithCustomError(investorWhiteList, "InvestorNotFound").withArgs(investor);
        });

        it("should revert if a user without INVESTOR_WL_MANAGER tries to remove Investor", async function () {
            await investorWhiteList.connect(apiManager).addInvestor(investor, attributes.investorType);

            // user does not have the INVESTOR_WL_MANAGER
            await expect(investorWhiteList.connect(user).removeInvestor(investor))
                .to.be.revertedWithCustomError(investorWhiteList, "UnauthorizedAccount")
                .withArgs(await user.getAddress(), roleManager.INVESTOR_WL_MANAGER());
        });

        it("should revert if the owner without INVESTOR_WL_MANAGER tries to remove Investor", async function () {
            await investorWhiteList.connect(apiManager).addInvestor(investor, attributes.investorType);

            // owner does not have the INVESTOR_WL_MANAGER
            await expect(investorWhiteList.connect(owner).removeInvestor(investor))
                .to.be.revertedWithCustomError(investorWhiteList, "UnauthorizedAccount")
                .withArgs(await owner.getAddress(), roleManager.INVESTOR_WL_MANAGER());
        });
    });

    describe("Block/Unblock Investor", function () {
        it("should allow a user with INVESTOR_WL_MANAGER to block/unblock an Investor", async function () {
            await investorWhiteList.connect(apiManager).addInvestor(investor, attributes.investorType);

            await investorWhiteList.connect(apiManager).blockInvestor(investor);
            let isBlocked = await investorWhiteList.isInvestorBlocked(investor);
            expect(isBlocked).to.be.true;

            await investorWhiteList.connect(apiManager).unblockInvestor(investor);
            isBlocked = await investorWhiteList.isInvestorBlocked(investor);
            expect(isBlocked).to.be.false;
        });

        it("should revert if trying to block/unblock a non-existent Investor", async function () {
            await expect(investorWhiteList.connect(apiManager).blockInvestor(investor))
                .to.be.revertedWithCustomError(investorWhiteList, "InvestorNotFound").withArgs(investor);

            await expect(investorWhiteList.connect(apiManager).unblockInvestor(investor))
                .to.be.revertedWithCustomError(investorWhiteList, "InvestorNotFound").withArgs(investor);
        });

        it("should revert if trying to block/unblock a removed Investor", async function () {
            await investorWhiteList.connect(apiManager).addInvestor(investor, attributes.investorType);

            await investorWhiteList.connect(apiManager).removeInvestor(investor);

            await expect(investorWhiteList.connect(apiManager).blockInvestor(investor))
                .to.be.revertedWithCustomError(investorWhiteList, "InvestorNotFound").withArgs(investor);

            await expect(investorWhiteList.connect(apiManager).unblockInvestor(investor))
                .to.be.revertedWithCustomError(investorWhiteList, "InvestorNotFound").withArgs(investor);
        });

        it("should revert if a user without INVESTOR_WL_MANAGER tries to block/unblock Investor", async function () {
            await investorWhiteList.connect(apiManager).addInvestor(investor, attributes.investorType);

            // user does not have the INVESTOR_WL_MANAGER
            await expect(investorWhiteList.connect(user).blockInvestor(investor))
                .to.be.revertedWithCustomError(investorWhiteList, "UnauthorizedAccount")
                .withArgs(await user.getAddress(), roleManager.INVESTOR_WL_MANAGER());

            await expect(investorWhiteList.connect(user).unblockInvestor(investor))
                .to.be.revertedWithCustomError(investorWhiteList, "UnauthorizedAccount")
                .withArgs(await user.getAddress(), roleManager.INVESTOR_WL_MANAGER());
        });

        it("should revert if the owner without INVESTOR_WL_MANAGER tries to block/unblock Investor", async function () {
            await investorWhiteList.connect(apiManager).addInvestor(investor, attributes.investorType);

            // owner does not have the INVESTOR_WL_MANAGER
            await expect(investorWhiteList.connect(owner).blockInvestor(investor))
                .to.be.revertedWithCustomError(investorWhiteList, "UnauthorizedAccount")
                .withArgs(await owner.getAddress(), roleManager.INVESTOR_WL_MANAGER());

            await expect(investorWhiteList.connect(owner).unblockInvestor(investor))
                .to.be.revertedWithCustomError(investorWhiteList, "UnauthorizedAccount")
                .withArgs(await owner.getAddress(), roleManager.INVESTOR_WL_MANAGER());
        });
    });

    describe("List Investors", function () {
        it("should list all Investors with their attributes", async function () {
            // Adding Investors with attributes
            await investorWhiteList.connect(apiManager).addInvestor(investor, attributes.investorType);
            await investorWhiteList.connect(apiManager).addInvestor(investor2, modifiedAttributes.investorType);
            await investorWhiteList.connect(apiManager).addInvestor(investor3, modifiedAttributes.investorType);

            // block investor1
            await investorWhiteList.connect(apiManager).blockInvestor(investor);
            // remove investor2
            await investorWhiteList.connect(apiManager).removeInvestor(investor2);
            // block/unblock investor3
            await investorWhiteList.connect(apiManager).blockInvestor(investor3);
            await investorWhiteList.connect(apiManager).unblockInvestor(investor3);

            const whiteList = await investorWhiteList.listInvestors();

            expect(whiteList.length).to.equal(3);

            // Checking the first Investor entry
            expect(whiteList[0].wallet).to.equal(investor);
            expect(whiteList[0].investorType).to.equal(attributes.investorType);
            expect(whiteList[0].blocked).to.equal(true);
            expect(whiteList[0].deleted).to.equal(false);

            // Checking the second Investor entry
            expect(whiteList[1].wallet).to.equal(investor2);
            expect(whiteList[1].investorType).to.equal(modifiedAttributes.investorType);
            expect(whiteList[1].blocked).to.equal(false);
            expect(whiteList[1].deleted).to.equal(true);

            // Checking the third Investor entry
            expect(whiteList[2].wallet).to.equal(investor3);
            expect(whiteList[2].investorType).to.equal(modifiedAttributes.investorType);
            expect(whiteList[2].blocked).to.equal(false);
            expect(whiteList[2].deleted).to.equal(false);
        });
    });

    describe("Add/Remove ISIN types allowed for Investor", function () {
        it("should allow a user with INVESTOR_WL_MANAGER to add/remove ISIN types allowed for an Investor", async function () {
            await investorWhiteList.connect(apiManager).addInvestor(investor, attributes.investorType);
            await investorWhiteList.connect(apiManager).addInvestor(investor2, attributes.investorType);
            await investorWhiteList.connect(apiManager).addInvestor(investor3, attributes.investorType);

            await investorWhiteList.connect(apiManager).addAllowedIsinType(investor, isinType1);
            await investorWhiteList.connect(apiManager).addAllowedIsinType(investor, isinType2);
            await investorWhiteList.connect(apiManager).addAllowedIsinType(investor, isinType2);

            await investorWhiteList.connect(apiManager).addAllowedIsinType(investor2, isinType1);
            await investorWhiteList.connect(apiManager).addAllowedIsinType(investor2, isinType2);

            await investorWhiteList.connect(apiManager).removeAllowedIsinType(investor2, isinType1);
            await investorWhiteList.connect(apiManager).removeAllowedIsinType(investor2, "sometype");

            expect(await investorWhiteList.isIsinTypeAllowed(investor, isinType1)).to.be.true;
            expect(await investorWhiteList.isIsinTypeAllowed(investor, isinType2)).to.be.true;
            expect(await investorWhiteList.isIsinTypeAllowed(investor2, isinType1)).to.be.false;
            expect(await investorWhiteList.isIsinTypeAllowed(investor2, isinType2)).to.be.true;
            expect(await investorWhiteList.isIsinTypeAllowed(investor3, isinType1)).to.be.false;
            expect(await investorWhiteList.isIsinTypeAllowed(investor3, isinType2)).to.be.false;

            const whiteList = await investorWhiteList.listInvestors();

            expect(whiteList.length).to.equal(3);

            expect(whiteList[0].wallet).to.equal(investor);
            expect(whiteList[0].allowedIsinTypes).to.have.length(2);
            expect(whiteList[0].allowedIsinTypes).to.contain(isinType1, isinType2);

            expect(whiteList[1].wallet).to.equal(investor2);
            expect(whiteList[1].allowedIsinTypes).to.have.length(1);
            expect(whiteList[1].allowedIsinTypes).to.contain(isinType2);

            expect(whiteList[2].wallet).to.equal(investor3);
            expect(whiteList[2].allowedIsinTypes).to.be.empty;
        });

        it("should revert if trying to add/remove ISIN type allowed for non-existent Investor", async function () {
            await expect(investorWhiteList.connect(apiManager).addAllowedIsinType(investor, isinType1))
                .to.be.revertedWithCustomError(investorWhiteList, "InvestorNotFound").withArgs(investor);

            await expect(investorWhiteList.connect(apiManager).removeAllowedIsinType(investor, isinType1))
                .to.be.revertedWithCustomError(investorWhiteList, "InvestorNotFound").withArgs(investor);
        });

        it("should revert if trying to add/remove ISIN type allowed for removed Investor", async function () {
            await investorWhiteList.connect(apiManager).addInvestor(investor, attributes.investorType);
            await investorWhiteList.connect(apiManager).removeInvestor(investor);

            await expect(investorWhiteList.connect(apiManager).addAllowedIsinType(investor, isinType1))
                .to.be.revertedWithCustomError(investorWhiteList, "InvestorNotFound").withArgs(investor);

            await expect(investorWhiteList.connect(apiManager).removeAllowedIsinType(investor, isinType1))
                .to.be.revertedWithCustomError(investorWhiteList, "InvestorNotFound").withArgs(investor);
        });

        it("should revert if a user without INVESTOR_WL_MANAGER tries to add/remove ISIN type allowed for Investor", async function () {
            await investorWhiteList.connect(apiManager).addInvestor(investor, attributes.investorType);

            // user does not have the INVESTOR_WL_MANAGER
            await expect(investorWhiteList.connect(user).addAllowedIsinType(investor, isinType1))
                .to.be.revertedWithCustomError(investorWhiteList, "UnauthorizedAccount")
                .withArgs(await user.getAddress(), roleManager.INVESTOR_WL_MANAGER());

            await expect(investorWhiteList.connect(user).removeAllowedIsinType(investor, isinType1))
                .to.be.revertedWithCustomError(investorWhiteList, "UnauthorizedAccount")
                .withArgs(await user.getAddress(), roleManager.INVESTOR_WL_MANAGER());
        });

        it("should revert if the owner without INVESTOR_WL_MANAGER tries to add/remove ISIN type allowed for Investor", async function () {
            await investorWhiteList.connect(apiManager).addInvestor(investor, attributes.investorType);

            // owner does not have the INVESTOR_WL_MANAGER
            await expect(investorWhiteList.connect(owner).addAllowedIsinType(investor, isinType1))
                .to.be.revertedWithCustomError(investorWhiteList, "UnauthorizedAccount")
                .withArgs(await owner.getAddress(), roleManager.INVESTOR_WL_MANAGER());

            await expect(investorWhiteList.connect(owner).removeAllowedIsinType(investor, isinType1))
                .to.be.revertedWithCustomError(investorWhiteList, "UnauthorizedAccount")
                .withArgs(await owner.getAddress(), roleManager.INVESTOR_WL_MANAGER());
        });
    });

    describe("Assert transfer allowed", function () {
        it("should return succeed for existing non-blocked investors with allowed isinType", async function () {
            // Adding investor
            await investorWhiteList.connect(apiManager).addInvestor(investor, attributes.investorType);
            await investorWhiteList.connect(apiManager).addAllowedIsinType(investor, isinType1);

            // block/unblock investor
            await investorWhiteList.connect(apiManager).blockInvestor(investor);
            await investorWhiteList.connect(apiManager).unblockInvestor(investor);

            await investorWhiteList.assertTransferAllowed(investor, isinType1);
        });

        it("should revert for non-existent investors", async function () {
            await expect(investorWhiteList.assertTransferAllowed(investor, isinType1)).to.be.revertedWithCustomError(investorWhiteList, "InvestorNotFound");

            // Adding investor
            await investorWhiteList.connect(apiManager).addInvestor(investor, attributes.investorType);

            await investorWhiteList.connect(apiManager).removeInvestor(investor);

            await expect(investorWhiteList.assertTransferAllowed(investor, isinType1)).to.be.revertedWithCustomError(investorWhiteList, "InvestorNotFound");
        });

        it("should revert for blocked investors", async function () {
            // Adding investors
            await investorWhiteList.connect(apiManager).addInvestor(investor, attributes.investorType);
            await investorWhiteList.connect(apiManager).addAllowedIsinType(investor, isinType1);

            await investorWhiteList.connect(apiManager).blockInvestor(investor);

            await expect(investorWhiteList.assertTransferAllowed(investor, isinType1)).to.be.revertedWithCustomError(investorWhiteList, "InvestorBlocked");
        });

        it("should revert for investors without allowed isinType", async function () {
            // Adding investors
            await investorWhiteList.connect(apiManager).addInvestor(investor, attributes.investorType);

            await expect(investorWhiteList.assertTransferAllowed(investor, isinType1)).to.be
                .revertedWithCustomError(investorWhiteList, "IsinTypeNotAllowedForInvestor").withArgs(investor);

            //Add wrong isin type
            await investorWhiteList.connect(apiManager).addAllowedIsinType(investor, isinType2);

            await expect(investorWhiteList.assertTransferAllowed(investor, isinType1)).to.be
                .revertedWithCustomError(investorWhiteList, "IsinTypeNotAllowedForInvestor").withArgs(investor);

            //Add and remove isin type
            await investorWhiteList.connect(apiManager).addAllowedIsinType(investor, isinType1);
            await investorWhiteList.connect(apiManager).removeAllowedIsinType(investor, isinType1);

            await expect(investorWhiteList.assertTransferAllowed(investor, isinType1)).to.be
                .revertedWithCustomError(investorWhiteList, "IsinTypeNotAllowedForInvestor").withArgs(investor);
        });
    });
});
