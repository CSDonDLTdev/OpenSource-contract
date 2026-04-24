import {expect} from "chai";
import {ethers, upgrades} from "hardhat";
import {ContractFactory, Signer} from "ethers";
import {
    InvestorWhitelistContractName,
    IsinPermitName,
    IsinWhitelistContractName,
    RoleManagerContractName
} from "../scripts/consts";

describe(IsinPermitName, function () {
    let isinPermit: any;
    let isinWhiteList: any;
    let roleManager: any;
    let investorWhiteList: any;
    let owner: Signer, isinManager: Signer, investorManager: Signer, mintBurnManager: Signer, user1: Signer,
        user2: Signer, escrow: Signer;
    let domain: any, types: any;
    let isin: string;

    async function prepareTransferParams(deadlineOverride?: number, valueOverride?: number, customValueOverride?: number) {
        // Set default values if parameters are not provided
        const defaultDeadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
        const defaultValue = 50;

        const deadline = deadlineOverride || defaultDeadline;
        const value = valueOverride || defaultValue;
        const customValue = customValueOverride || defaultValue;


        // Fetch the nonce for the user
        const nonce = await isinPermit.nonces(await user1.getAddress());

        // Prepare the permit data
        const permitData = {
            owner: await user1.getAddress(),
            to: await user2.getAddress(),
            value: value,
            customvalue: customValue,
            nonce: nonce,
            deadline: deadline,
        };

        // Sign the data using EIP-712
        const signature = await user1.signTypedData(domain, types.Transfer, permitData);

        // Extract r, s, v from the signature
        const r = signature.slice(0, 66);
        const s = "0x" + signature.slice(66, 130);
        const v = parseInt(signature.slice(130, 132), 16);

        return {value, customValue, deadline, r, s, v};
    }

    async function prepareApproveParams(deadlineOverride?: number, valueOverride?: number) {
        // Set default values if parameters are not provided
        const defaultDeadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
        const defaultValue = 50;

        const deadline = deadlineOverride || defaultDeadline;
        const value = valueOverride || defaultValue;

        // Fetch the nonce for the user
        const nonce = await isinPermit.nonces(await user1.getAddress());

        // Prepare the permit data
        const permitData = {
            owner: await user1.getAddress(),
            to: await user2.getAddress(),
            deposit: await escrow.getAddress(),
            value: value,
            nonce: nonce,
            deadline: deadline,
        };

        // Sign the data using EIP-712
        const signature = await user1.signTypedData(domain, types.Approve, permitData);

        // Extract r, s, v from the signature
        const r = signature.slice(0, 66);
        const s = "0x" + signature.slice(66, 130);
        const v = parseInt(signature.slice(130, 132), 16);

        return {value, deadline, r, s, v};
    }

    async function prepareBurnParams(deadlineOverride?: number, valueOverride?: number) {
        // Set default values if parameters are not provided
        const defaultDeadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
        const defaultValue = 50;

        const deadline = deadlineOverride || defaultDeadline;
        const value = valueOverride || defaultValue;

        // Fetch the nonce for the user
        const nonce = await isinPermit.nonces(await user1.getAddress());

        // Prepare the permit data
        const permitData = {
            owner: await user1.getAddress(),
            value: value,
            nonce: nonce,
            deadline: deadline,
        };

        // Sign the data using EIP-712
        const signature = await user1.signTypedData(domain, types.Burn, permitData);

        // Extract r, s, v from the signature
        const r = signature.slice(0, 66);
        const s = "0x" + signature.slice(66, 130);
        const v = parseInt(signature.slice(130, 132), 16);

        return {value, deadline, r, s, v};
    }

    beforeEach(async function () {
        const Beacon = await ethers.getContractFactory(IsinPermitName);
        const beacon = await upgrades.deployBeacon(Beacon);
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

        // Get contract factory and signers
        // const IsinPermit = await ethers.getContractFactory(IsinPermitName);
        [owner, isinManager, investorManager, mintBurnManager, user1, user2, escrow] = await ethers.getSigners();

        // setup role
        await roleManager.grantRole(await roleManager.ISIN_WL_MANAGER(), await isinManager.getAddress());
        await roleManager.grantRole(await roleManager.ISIN_MINT_BURN_MANAGER(), await mintBurnManager.getAddress());
        await roleManager.grantRole(await roleManager.INVESTOR_WL_MANAGER(), await investorManager.getAddress());

        //create IsinPermit via whitelist
        isin = "US1234567890";

        await isinWhiteList.connect(isinManager).addIsin(
            isin, "ES", "Company A", "CompA", "IssuerA", "ISSA", "CFI001"
        );

        // Fetch whiteList details
        const whiteList = await isinWhiteList.listIsins();
        isinPermit = await ethers.getContractAt(IsinPermitName, whiteList[0].addr);

        //Add investors with allowed isin types
        await investorWhiteList.connect(investorManager).addInvestor(await user1.getAddress(), "abcd");
        await investorWhiteList.connect(investorManager).addAllowedIsinType(await user1.getAddress(), "ES");
        await investorWhiteList.connect(investorManager).addInvestor(await user2.getAddress(), "abcd");
        await investorWhiteList.connect(investorManager).addAllowedIsinType(await user2.getAddress(), "ES");

        // Mint tokens to user1
        await isinPermit.connect(mintBurnManager).mint(await user1.getAddress(), 100);

        // Define domain and types for permit
        domain = {
            name: isin,
            version: "1",
            chainId: await owner.provider!.getNetwork().then(n => n.chainId),
            verifyingContract: isinPermit.target,
        };

        types = {
            Transfer: {
                Transfer: [
                    {name: "owner", type: "address"},
                    {name: "to", type: "address"},
                    {name: "value", type: "uint256"},
                    {name: "customvalue", type: "uint256"},
                    {name: "nonce", type: "uint256"},
                    {name: "deadline", type: "uint256"},
                ],
            },
            Approve: {
                Approve: [
                    {name: "owner", type: "address"},
                    {name: "to", type: "address"},
                    {name: "deposit", type: "address"},
                    {name: "value", type: "uint256"},
                    {name: "nonce", type: "uint256"},
                    {name: "deadline", type: "uint256"},
                ],
            },
            Burn: {
                Burn: [
                    {name: "owner", type: "address"},
                    {name: "value", type: "uint256"},
                    {name: "nonce", type: "uint256"},
                    {name: "deadline", type: "uint256"},
                ],
            }
        };
    });

    describe("Transfer Permit", function () {
        it("Should initialize the contract with correct values", async function () {
            expect(await isinPermit.name()).to.equal(isin);
            expect(await isinPermit.symbol()).to.equal(isin);
            expect(await isinPermit.owner()).to.equal(await isinManager.getAddress());
        });

        it("Should allow transfer with a valid permit", async function () {
            const {value, customValue, deadline, r, s, v} = await prepareTransferParams();

            // Transfer using permit
            await expect(await isinPermit.transferPermit(await user1.getAddress(), await user2.getAddress(), value, customValue, deadline, v, r, s))
                .to.emit(isinPermit, "IsinTransfer")
                .withArgs(await user1.getAddress(), await user2.getAddress(), value, customValue);
            
            // Check balances after transfer
            expect(await isinPermit.balanceOf(await user1.getAddress())).to.equal(50);
            expect(await isinPermit.balanceOf(await user2.getAddress())).to.equal(50);
        });

        it("Should fail to transfer with an expired permit", async function () {
            // Prepare transferPermit data with expired deadline
            const {value, customValue, deadline, r, s, v} = await prepareTransferParams(Math.floor(Date.now() / 1000) - 100);

            // Attempt transfer using expired permit
            await expect(
                isinPermit.transferPermit(await user1.getAddress(), await user2.getAddress(), value, customValue, deadline, v, r, s)
            ).to.be.revertedWithCustomError(isinPermit, "ERC2612ExpiredSignature");
        });

        it("Should fail to transfer with an invalid signature", async function () {
            const {value, customValue, deadline, r, s, v} = await prepareTransferParams();

            // Attempt transfer with tampered signature
            await expect(
                isinPermit.transferPermit(await user2.getAddress(), await user1.getAddress(), value, customValue, deadline, v, r, s)
            ).to.be.revertedWithCustomError(isinPermit, "ERC2612InvalidSigner")
        });

        it("Should fail to transfer with sender not in investor whitelist", async function () {
            //remove user1
            await investorWhiteList.connect(investorManager).removeInvestor(await user1.getAddress());

            const {value, customValue, deadline, r, s, v} = await prepareTransferParams();

            await expect(
                isinPermit.transferPermit(await user1.getAddress(), await user2.getAddress(), value, customValue, deadline, v, r, s)
            ).to.be.revertedWithCustomError(investorWhiteList, "InvestorNotFound").withArgs(await user1.getAddress());
        });

        it("Should fail to transfer with sender blocked in investor whitelist", async function () {
            //block user1
            await investorWhiteList.connect(investorManager).blockInvestor(await user1.getAddress());

            const {value, customValue, deadline, r, s, v} = await prepareTransferParams();

            await expect(
                isinPermit.transferPermit(await user1.getAddress(), await user2.getAddress(), value, customValue, deadline, v, r, s)
            ).to.be.revertedWithCustomError(investorWhiteList, "InvestorBlocked").withArgs(await user1.getAddress());
        });

        it("Should fail to transfer with sender is not allowed to use ES type", async function () {
            //remove user1 allowed isin type
            await investorWhiteList.connect(investorManager).addAllowedIsinType(await user1.getAddress(), "DB");
            await investorWhiteList.connect(investorManager).removeAllowedIsinType(await user1.getAddress(), "ES");

            const {value, customValue, deadline, r, s, v} = await prepareTransferParams();

            await expect(
                isinPermit.transferPermit(await user1.getAddress(), await user2.getAddress(), value, customValue, deadline, v, r, s)
            ).to.be.revertedWithCustomError(investorWhiteList, "IsinTypeNotAllowedForInvestor").withArgs(await user1.getAddress());
        });

        it("Should fail to transfer with receiver not in investor whitelist", async function () {
            //remove user2
            await investorWhiteList.connect(investorManager).removeInvestor(await user2.getAddress());

            const {value, customValue, deadline, r, s, v} = await prepareTransferParams();

            await expect(
                isinPermit.transferPermit(await user1.getAddress(), await user2.getAddress(), value, customValue, deadline, v, r, s)
            ).to.be.revertedWithCustomError(investorWhiteList, "InvestorNotFound").withArgs(await user2.getAddress());
        });

        it("Should fail to transfer with receiver blocked in investor whitelist", async function () {
            // block user2
            await investorWhiteList.connect(investorManager).blockInvestor(await user2.getAddress());

            const {value, customValue, deadline, r, s, v} = await prepareTransferParams();

            await expect(
                isinPermit.transferPermit(await user1.getAddress(), await user2.getAddress(), value, customValue, deadline, v, r, s)
            ).to.be.revertedWithCustomError(investorWhiteList, "InvestorBlocked").withArgs(await user2.getAddress());
        });

        it("Should fail to transfer with receiver not allowed to use ES type", async function () {
            //remove user2 allowed isin type
            await investorWhiteList.connect(investorManager).removeAllowedIsinType(await user2.getAddress(), "ES");

            const {value, customValue, deadline, r, s, v} = await prepareTransferParams();

            await expect(
                isinPermit.transferPermit(await user1.getAddress(), await user2.getAddress(), value, customValue, deadline, v, r, s)
            ).to.be.revertedWithCustomError(investorWhiteList, "IsinTypeNotAllowedForInvestor").withArgs(await user2.getAddress());
        });


        it("Should fail to transfer with isin blocked", async function () {
            //block isin
            await isinWhiteList.connect(isinManager).blockIsin(isin);

            const {value, customValue, deadline, r, s, v} = await prepareTransferParams();

            await expect(
                isinPermit.transferPermit(await user1.getAddress(), await user2.getAddress(), value, customValue, deadline, v, r, s)
            ).to.be.revertedWithCustomError(isinWhiteList, "IsinBlocked");
        });

        it("Should fail to transfer with isin removed", async function () {
            //remove isin
            await isinPermit.connect(mintBurnManager).burn(await user1.getAddress(), 100);
            await isinWhiteList.connect(isinManager).removeIsin(isin);

            const {value, customValue, deadline, r, s, v} = await prepareTransferParams();

            await expect(
                isinPermit.transferPermit(await user1.getAddress(), await user2.getAddress(), value, customValue, deadline, v, r, s)
            ).to.be.revertedWithCustomError(isinWhiteList, "IsinNotFound");
        });

        it("Should fail on insufficient balance", async function () {
            const {value, customValue, deadline, r, s, v} = await prepareTransferParams(undefined, 120);

            await expect(
                isinPermit.transferPermit(await user1.getAddress(), await user2.getAddress(), value, customValue, deadline, v, r, s)
            ).to.be.revertedWithCustomError(isinPermit, "ERC20InsufficientBalance")
                .withArgs(await user1.getAddress(), 100, 120);
        });
    });

    describe("Approve Permit", function () {
        it("Should allow approve with a valid permit", async function () {
            const {value, deadline, r, s, v} = await prepareApproveParams();

            // Approve using permit
           await isinPermit.approvePermit(await user1.getAddress(), await user2.getAddress(), await escrow.getAddress(), value, deadline, v, r, s);

            // Check balances after approve
            expect(await isinPermit.balanceOf(await user1.getAddress())).to.equal(100);
            expect(await isinPermit.allowance(await user1.getAddress(), await escrow.getAddress())).to.equal(50);
        });

        it("Should fail to approve with an expired permit", async function () {
            // Prepare approvePermit data with expired deadline
            const {value, deadline, r, s, v} = await prepareApproveParams(Math.floor(Date.now() / 1000) - 100);

            // Attempt approve using expired permit
            await expect(
                isinPermit.approvePermit(await user1.getAddress(), await user2.getAddress(), await escrow.getAddress(), value, deadline, v, r, s)
            ).to.be.revertedWithCustomError(isinPermit, "ERC2612ExpiredSignature");
        });

        it("Should fail to approve with an invalid signature", async function () {
            const {value, deadline, r, s, v} = await prepareApproveParams();

            // Attempt approve with tampered signature
            await expect(
                isinPermit.approvePermit(await user2.getAddress(), await user1.getAddress(), await escrow.getAddress(), value, deadline, v, r, s)
            ).to.be.revertedWithCustomError(isinPermit, "ERC2612InvalidSigner")
        });

        it("Should fail to approve with sender not in investor whitelist", async function () {
            //remove user1
            await investorWhiteList.connect(investorManager).removeInvestor(await user1.getAddress());

            const {value, deadline, r, s, v} = await prepareApproveParams();

            await expect(
                isinPermit.approvePermit(await user1.getAddress(), await user2.getAddress(), await escrow.getAddress(), value, deadline, v, r, s)
            ).to.be.revertedWithCustomError(investorWhiteList, "InvestorNotFound").withArgs(await user1.getAddress());
        });

        it("Should fail to approve with sender blocked in investor whitelist", async function () {
            //block user1
            await investorWhiteList.connect(investorManager).blockInvestor(await user1.getAddress());

            const {value, deadline, r, s, v} = await prepareApproveParams();

            await expect(
                isinPermit.approvePermit(await user1.getAddress(), await user2.getAddress(), await escrow.getAddress(), value, deadline, v, r, s)
            ).to.be.revertedWithCustomError(investorWhiteList, "InvestorBlocked").withArgs(await user1.getAddress());
        });

        it("Should fail to approve with sender is not allowed to use ES type", async function () {
            //remove user1 allowed isin type
            await investorWhiteList.connect(investorManager).addAllowedIsinType(await user1.getAddress(), "DB");
            await investorWhiteList.connect(investorManager).removeAllowedIsinType(await user1.getAddress(), "ES");

            const {value, deadline, r, s, v} = await prepareApproveParams();

            await expect(
                isinPermit.approvePermit(await user1.getAddress(), await user2.getAddress(), await escrow.getAddress(), value, deadline, v, r, s)
            ).to.be.revertedWithCustomError(investorWhiteList, "IsinTypeNotAllowedForInvestor").withArgs(await user1.getAddress());
        });

        it("Should fail to approve with receiver not in investor whitelist", async function () {
            //remove user2
            await investorWhiteList.connect(investorManager).removeInvestor(await user2.getAddress());

            const {value, deadline, r, s, v} = await prepareApproveParams();

            await expect(
                isinPermit.approvePermit(await user1.getAddress(), await user2.getAddress(), await escrow.getAddress(), value, deadline, v, r, s)
            ).to.be.revertedWithCustomError(investorWhiteList, "InvestorNotFound").withArgs(await user2.getAddress());
        });

        it("Should fail to approve with receiver blocked in investor whitelist", async function () {
            // block user2
            await investorWhiteList.connect(investorManager).blockInvestor(await user2.getAddress());

            const {value, deadline, r, s, v} = await prepareApproveParams();

            await expect(
                isinPermit.approvePermit(await user1.getAddress(), await user2.getAddress(), await escrow.getAddress(), value, deadline, v, r, s)
            ).to.be.revertedWithCustomError(investorWhiteList, "InvestorBlocked").withArgs(await user2.getAddress());
        });

        it("Should fail to approve with receiver not allowed to use ES type", async function () {
            //remove user2 allowed isin type
            await investorWhiteList.connect(investorManager).removeAllowedIsinType(await user2.getAddress(), "ES");

            const {value, deadline, r, s, v} = await prepareApproveParams();

            await expect(
                isinPermit.approvePermit(await user1.getAddress(), await user2.getAddress(), await escrow.getAddress(), value, deadline, v, r, s)
            ).to.be.revertedWithCustomError(investorWhiteList, "IsinTypeNotAllowedForInvestor").withArgs(await user2.getAddress());
        });


        it("Should fail to approve with isin blocked", async function () {
            //block isin
            await isinWhiteList.connect(isinManager).blockIsin(isin);

            const {value, deadline, r, s, v} = await prepareApproveParams();

            await expect(
                isinPermit.approvePermit(await user1.getAddress(), await user2.getAddress(), await escrow.getAddress(), value, deadline, v, r, s)
            ).to.be.revertedWithCustomError(isinWhiteList, "IsinBlocked");
        });

        it("Should fail to approve with isin removed", async function () {
            //remove isin
            await isinPermit.connect(mintBurnManager).burn(await user1.getAddress(), 100);
            await isinWhiteList.connect(isinManager).removeIsin(isin);

            const {value, deadline, r, s, v} = await prepareApproveParams();

            await expect(
                isinPermit.approvePermit(await user1.getAddress(), await user2.getAddress(), await escrow.getAddress(), value, deadline, v, r, s)
            ).to.be.revertedWithCustomError(isinWhiteList, "IsinNotFound");
        });

        it("Should fail to approve on insufficient balance", async function () {
            const {value, deadline, r, s, v} = await prepareApproveParams(undefined, 120);

            await expect(
                isinPermit.approvePermit(await user1.getAddress(), await user2.getAddress(), await escrow.getAddress(), value, deadline, v, r, s)
            ).to.be.revertedWithCustomError(isinPermit, "ERC20InsufficientBalance")
                .withArgs(await user1.getAddress(), 100, 120);
        });
    });

    describe("Burn Permit", function () {
        it("Should allow burn with a valid permit", async function () {
            const {value, deadline, r, s, v} = await prepareBurnParams();

            // Burn using permit
            await expect(await isinPermit.burnPermit(await user1.getAddress(), value, deadline, v, r, s))
                .to.emit(isinPermit, "IsinDltTransfer")
                .withArgs(await user1.getAddress(), "0x0000000000000000000000000000000000000000", value);

            // Check balances after burn
            expect(await isinPermit.balanceOf(await user1.getAddress())).to.equal(50);
        });

        it("Should fail to burn with an expired permit", async function () {
            // Prepare burnPermit data with expired deadline
            const {value, deadline, r, s, v} = await prepareBurnParams(Math.floor(Date.now() / 1000) - 100);

            // Attempt burn using expired permit
            await expect(
                isinPermit.burnPermit(await user1.getAddress(), value, deadline, v, r, s)
            ).to.be.revertedWithCustomError(isinPermit, "ERC2612ExpiredSignature");
        });

        it("Should fail to burn with an invalid signature", async function () {
            const {value, deadline, r, s, v} = await prepareBurnParams();

            // Attempt burn with tampered signature
            await expect(
                isinPermit.burnPermit(await user2.getAddress(), value, deadline, v, r, s)
            ).to.be.revertedWithCustomError(isinPermit, "ERC2612InvalidSigner")
        });

        it("Should fail to burn with sender not in investor whitelist", async function () {
            //remove user1
            await investorWhiteList.connect(investorManager).removeInvestor(await user1.getAddress());

            const {value, deadline, r, s, v} = await prepareBurnParams();

            await expect(
                isinPermit.burnPermit(await user1.getAddress(), value, deadline, v, r, s)
            ).to.be.revertedWithCustomError(investorWhiteList, "InvestorNotFound").withArgs(await user1.getAddress());
        });

        it("Should fail to burn with sender blocked in investor whitelist", async function () {
            //block user1
            await investorWhiteList.connect(investorManager).blockInvestor(await user1.getAddress());

            const {value, deadline, r, s, v} = await prepareBurnParams();

            await expect(
                isinPermit.burnPermit(await user1.getAddress(), value, deadline, v, r, s)
            ).to.be.revertedWithCustomError(investorWhiteList, "InvestorBlocked").withArgs(await user1.getAddress());
        });

        it("Should fail to burn with sender is not allowed to use ES type", async function () {
            //remove user1 allowed isin type
            await investorWhiteList.connect(investorManager).addAllowedIsinType(await user1.getAddress(), "DB");
            await investorWhiteList.connect(investorManager).removeAllowedIsinType(await user1.getAddress(), "ES");

            const {value, deadline, r, s, v} = await prepareBurnParams();

            await expect(
                isinPermit.burnPermit(await user1.getAddress(), value, deadline, v, r, s)
            ).to.be.revertedWithCustomError(investorWhiteList, "IsinTypeNotAllowedForInvestor").withArgs(await user1.getAddress());
        });

        it("Should fail to burn with isin blocked", async function () {
            //block isin
            await isinWhiteList.connect(isinManager).blockIsin(isin);

            const {value, deadline, r, s, v} = await prepareBurnParams();

            await expect(
                isinPermit.burnPermit(await user1.getAddress(), value, deadline, v, r, s)
            ).to.be.revertedWithCustomError(isinWhiteList, "IsinBlocked");
        });

        it("Should fail to burn with isin removed", async function () {
            //remove isin
            await isinPermit.connect(mintBurnManager).burn(await user1.getAddress(), 100);
            await isinWhiteList.connect(isinManager).removeIsin(isin);

            const {value, deadline, r, s, v} = await prepareBurnParams();

            await expect(
                isinPermit.burnPermit(await user1.getAddress(), value, deadline, v, r, s)
            ).to.be.revertedWithCustomError(isinWhiteList, "IsinNotFound");
        });

        it("Should fail to burn on insufficient balance", async function () {
            const {value, deadline, r, s, v} = await prepareBurnParams(undefined, 120);

            await expect(
                isinPermit.burnPermit(await user1.getAddress(), value, deadline, v, r, s)
            ).to.be.revertedWithCustomError(isinPermit, "ERC20InsufficientBalance")
                .withArgs(await user1.getAddress(), 100, 120);
        });
    });

    describe("Mint", function () {
        it("should allow a user with ISIN_MINT_BURN_MANAGER role to mint", async function () {
            const mintAmount: bigint = 100n;

            const initialBalance = await isinPermit.balanceOf(await user1.getAddress());

            // Manager mints tokens to the user
            await expect(await isinPermit.connect(mintBurnManager).mint(await user1.getAddress(), mintAmount))
                .to.emit(isinPermit, "IsinDltTransfer")
                .withArgs("0x0000000000000000000000000000000000000000", await user1.getAddress(), mintAmount);

            // Verify the balance of the user
            const balance = await isinPermit.balanceOf(await user1.getAddress());
            expect(balance).to.equal(initialBalance + mintAmount);
        });

        it("should not allow a user without ISIN_MINT_BURN_MANAGER role to mint", async function () {
            // Attempt mint by a non-managementApi
            await expect(isinPermit.connect(user2).mint(await user1.getAddress(), 100))
                .to.be.revertedWithCustomError(isinPermit, "UnauthorizedAccount")
                .withArgs(await user2.getAddress(), roleManager.ISIN_MINT_BURN_MANAGER());
        });

        it("should not allow the owner without ISIN_MINT_BURN_MANAGER role to mint", async function () {
            const mintAmount: bigint = 100n;

            // Attempt mint by the owner
            await expect(isinPermit.connect(owner).mint(await user1.getAddress(), mintAmount))
                .to.be.revertedWithCustomError(isinPermit, "UnauthorizedAccount")
                .withArgs(await owner.getAddress(), roleManager.ISIN_MINT_BURN_MANAGER());
        });

        it("Should fail to mint to user not in investor whitelist", async function () {
            //remove user1
            await investorWhiteList.connect(investorManager).removeInvestor(await user1.getAddress());

            await expect(
                isinPermit.connect(mintBurnManager).mint(await user1.getAddress(), 10)
            ).to.be.revertedWithCustomError(investorWhiteList, "InvestorNotFound").withArgs(await user1.getAddress());
        });

        it("Should fail to mint to user blocked in investor whitelist", async function () {
            //block user1
            await investorWhiteList.connect(investorManager).blockInvestor(await user1.getAddress());

            await expect(
                isinPermit.connect(mintBurnManager).mint(await user1.getAddress(), 10)
            ).to.be.revertedWithCustomError(investorWhiteList, "InvestorBlocked").withArgs(await user1.getAddress());
        });

        it("Should fail to mint to user not allowed to use ES type", async function () {
            //remove user1 allowed isin type
            await investorWhiteList.connect(investorManager).addAllowedIsinType(await user1.getAddress(), "DB");
            await investorWhiteList.connect(investorManager).removeAllowedIsinType(await user1.getAddress(), "ES");

            await expect(
                isinPermit.connect(mintBurnManager).mint(await user1.getAddress(), 10)
            ).to.be.revertedWithCustomError(investorWhiteList, "IsinTypeNotAllowedForInvestor").withArgs(await user1.getAddress());
        });

        it("Should fail to mint with isin blocked", async function () {
            //block isin
            await isinWhiteList.connect(isinManager).blockIsin(isin);

            await expect(
                isinPermit.connect(mintBurnManager).mint(await user1.getAddress(), 10)
            ).to.be.revertedWithCustomError(isinWhiteList, "IsinBlocked");
        });

        it("Should fail to mint with isin removed", async function () {
            //remove isin
            await isinPermit.connect(mintBurnManager).burn(await user1.getAddress(), 100);
            await isinWhiteList.connect(isinManager).removeIsin(isin);

            await expect(
                isinPermit.connect(mintBurnManager).mint(await user1.getAddress(), 10)
            ).to.be.revertedWithCustomError(isinWhiteList, "IsinNotFound");
        });
    });

    describe("Burn", function () {
        it("should allow a user with ISIN_MINT_BURN_MANAGER role to burn", async function () {
            const burnAmount: bigint = 20n;

            const initialBalance = await isinPermit.balanceOf(await user1.getAddress());

            // Manager burns tokens from the user
            await expect(await isinPermit.connect(mintBurnManager).burn(await user1.getAddress(), burnAmount))
                .to.emit(isinPermit, "IsinDltTransfer")
                .withArgs(await user1.getAddress(), "0x0000000000000000000000000000000000000000", burnAmount);

            // Verify the balance of the user
            const balance = await isinPermit.balanceOf(await user1.getAddress());
            expect(balance).to.equal(initialBalance - burnAmount);
        });

        it("should not allow a user without ISIN_MINT_BURN_MANAGER role to burn", async function () {
            const burnAmount = 50;

            // Attempt burn by a non-managementApi
            await expect(isinPermit.connect(user2).burn(await user1.getAddress(), burnAmount))
                .to.be.revertedWithCustomError(isinPermit, "UnauthorizedAccount")
                .withArgs(await user2.getAddress(), roleManager.ISIN_MINT_BURN_MANAGER());
        });

        it("should not allow the owner without ISIN_MINT_BURN_MANAGER role to burn", async function () {
            const burnAmount = 50;

            // Attempt burn by the owner
            await expect(isinPermit.connect(owner).burn(await user1.getAddress(), burnAmount))
                .to.be.revertedWithCustomError(isinPermit, "UnauthorizedAccount")
                .withArgs(await owner.getAddress(), roleManager.ISIN_MINT_BURN_MANAGER());
        });

        it("should not allow burning more tokens than were minted", async function () {
            const mintAmount = 100;
            const burnAmount = 150;

            const initialBalance = await isinPermit.balanceOf(await user1.getAddress());
            // Manager mints tokens to user2
            await isinPermit.connect(mintBurnManager).mint(await user2.getAddress(), mintAmount);

            // Attempt to burn more tokens than minted
            await expect(isinPermit.connect(mintBurnManager).burn(await user1.getAddress(), burnAmount))
                .to.be.revertedWithCustomError(isinPermit, "ERC20InsufficientBalance")
                .withArgs(await user1.getAddress(), initialBalance, burnAmount);
        });
    });

    describe("Assert transfer allowed", function () {
        it("Should succeed when isin exists and is not blocked, both users exist, are not blocked, are allowed to use isin type and sender has sufficient balance",
            async function () {
                await isinPermit["assertTransferAllowed(address,address,uint256)"](await user1.getAddress(), await user2.getAddress(), 100);
            });

        it("Should fail with sender not in investor whitelist", async function () {
            //remove user1
            await investorWhiteList.connect(investorManager).removeInvestor(await user1.getAddress());

            await expect(
                isinPermit["assertTransferAllowed(address,address,uint256)"](await user1.getAddress(), await user2.getAddress(), 100)
            ).to.be.revertedWithCustomError(investorWhiteList, "InvestorNotFound").withArgs(await user1.getAddress());
        });

        it("Should fail with sender blocked in investor whitelist", async function () {
            //block user1
            await investorWhiteList.connect(investorManager).blockInvestor(await user1.getAddress());

            await expect(
                isinPermit["assertTransferAllowed(address,address,uint256)"](await user1.getAddress(), await user2.getAddress(), 100)
            ).to.be.revertedWithCustomError(investorWhiteList, "InvestorBlocked").withArgs(await user1.getAddress());
        });

        it("Should fail with sender is not allowed to use ES type", async function () {
            //remove user1 allowed isin type
            await investorWhiteList.connect(investorManager).addAllowedIsinType(await user1.getAddress(), "DB");
            await investorWhiteList.connect(investorManager).removeAllowedIsinType(await user1.getAddress(), "ES");

            await expect(
                isinPermit["assertTransferAllowed(address,address,uint256)"](await user1.getAddress(), await user2.getAddress(), 100)
            ).to.be.revertedWithCustomError(investorWhiteList, "IsinTypeNotAllowedForInvestor").withArgs(await user1.getAddress());
        });

        it("Should fail with receiver not in investor whitelist", async function () {
            //remove user2
            await investorWhiteList.connect(investorManager).removeInvestor(await user2.getAddress());

            await expect(
                isinPermit["assertTransferAllowed(address,address,uint256)"](await user1.getAddress(), await user2.getAddress(), 100)
            ).to.be.revertedWithCustomError(investorWhiteList, "InvestorNotFound").withArgs(await user2.getAddress());
        });

        it("Should fail with receiver blocked in investor whitelist", async function () {
            // block user2
            await investorWhiteList.connect(investorManager).blockInvestor(await user2.getAddress());

            await expect(
                isinPermit["assertTransferAllowed(address,address,uint256)"](await user1.getAddress(), await user2.getAddress(), 50)
            ).to.be.revertedWithCustomError(investorWhiteList, "InvestorBlocked").withArgs(await user2.getAddress());
        });

        it("Should fail with receiver not allowed to use ES type", async function () {
            //remove user2 allowed isin type
            await investorWhiteList.connect(investorManager).removeAllowedIsinType(await user2.getAddress(), "ES");

            await expect(
                isinPermit["assertTransferAllowed(address,address,uint256)"](await user1.getAddress(), await user2.getAddress(), 100)
            ).to.be.revertedWithCustomError(investorWhiteList, "IsinTypeNotAllowedForInvestor").withArgs(await user2.getAddress());
        });


        it("Should fail with isin blocked", async function () {
            //block isin
            await isinWhiteList.connect(isinManager).blockIsin(isin);

            await expect(
                isinPermit["assertTransferAllowed(address,address,uint256)"](await user1.getAddress(), await user2.getAddress(), 50)
            ).to.be.revertedWithCustomError(isinWhiteList, "IsinBlocked");
        });

        it("Should fail with isin removed", async function () {
            //remove isin
            await isinPermit.connect(mintBurnManager).burn(await user1.getAddress(), 100);
            await isinWhiteList.connect(isinManager).removeIsin(isin);

            await expect(
                isinPermit["assertTransferAllowed(address,address,uint256)"](await user1.getAddress(), await user2.getAddress(), 50)
            ).to.be.revertedWithCustomError(isinWhiteList, "IsinNotFound");
        });

        it("Should fail on insufficient balance", async function () {
            await expect(
                isinPermit["assertTransferAllowed(address,address,uint256)"](await user1.getAddress(), await user2.getAddress(), 120)
            ).to.be.revertedWithCustomError(isinPermit, "ERC20InsufficientBalance")
                .withArgs(await user1.getAddress(), 100, 120);
        });
    });
});
