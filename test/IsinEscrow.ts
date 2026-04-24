import {expect} from "chai";
import {ethers, upgrades} from "hardhat";
import {ContractFactory, Signer} from "ethers";
import {
    InvestorWhitelistContractName, IsinEscrowContractName,
    IsinPermitName,
    IsinWhitelistContractName,
    RoleManagerContractName
} from "../scripts/consts";

describe(IsinEscrowContractName, function () {
    let isinPermit: any;
    let isinWhiteList: any;
    let roleManager: any;
    let investorWhiteList: any;
    let isinEscrow: any;
    let owner: Signer, isinManager: Signer, investorManager: Signer, mintBurnManager: Signer, user1: Signer,
        user2: Signer;
    let domain: any, createTransferOrderTypes: any, resolveTransferOrderTypes: any;
    let isin: string;

    async function prepareTransferOrderParams(deadlineOverride?: number, valueOverride?: number, customValueOverride?: number) {
        // Set default values if parameters are not provided
        const defaultDeadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
        const defaultValue = 60;

        const deadline = deadlineOverride || defaultDeadline;
        const value = valueOverride || defaultValue;
        const customValue = customValueOverride || 20000;

        // Fetch the nonce for the user
        const nonce = await isinEscrow.nonces(await user1.getAddress());

        // Prepare the permit data
        const transferOrder = {
                sender: await user1.getAddress(),
                receiver: await user2.getAddress(),
                isinAddr: await isinPermit.getAddress(),
                value: value,
                customValue: customValue
        };
        const createTransferOrder = {
            data: transferOrder,
            nonce: nonce,
            deadline: deadline,
        };

        // Sign the data using EIP-712
        const signature = await user1.signTypedData(domain, createTransferOrderTypes, createTransferOrder);

        // Extract v, r, s from the signature
        const r = signature.slice(0, 66);
        const s = "0x" + signature.slice(66, 130);
        const v = parseInt(signature.slice(130, 132), 16);

        return {transferOrder, deadline, v, r, s};
    }

    async function prepareResolveTransferOrderParams(type: any, signer: Signer, orderHash: string, deadlineOverride?: number) {
        // Set default values if parameters are not provided
        const defaultDeadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

        const deadline = deadlineOverride || defaultDeadline;

        const resolveTransferOrder = {
            orderHash: orderHash,
            deadline: deadline,
        };

        // Sign the data using EIP-712
        const signature = await signer.signTypedData(domain, type, resolveTransferOrder);

        // Extract v, r, s from the signature
        const r = signature.slice(0, 66);
        const s = "0x" + signature.slice(66, 130);
        const v = parseInt(signature.slice(130, 132), 16);

        return {deadline, v, r, s};
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
        const IsinEscrowFactory: ContractFactory = await ethers.getContractFactory(IsinEscrowContractName);
        isinEscrow = await upgrades.deployProxy(IsinEscrowFactory, [], {initializer: "initialize"});
        await isinEscrow.waitForDeployment();

        // Get contract factory and signers
        // const IsinPermit = await ethers.getContractFactory(IsinPermitName);
        [owner, isinManager, investorManager, mintBurnManager, user1, user2] = await ethers.getSigners();

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

        // approve transfer of tokens to escrow
        await isinPermit.connect(user1).approve(await isinEscrow.getAddress(), 60);

        // Define domain and types for escrow
        domain = {
            name: IsinEscrowContractName,
            version: "1",
            chainId: await owner.provider!.getNetwork().then(n => n.chainId),
            verifyingContract: isinEscrow.target,
        };

        createTransferOrderTypes = {
            CreateTransferOrder: [
                {name: "data", type: "TransferOrder"},
                {name: "nonce", type: "uint256"},
                {name: "deadline", type: "uint256"},
            ],
            TransferOrder: [
                {name: "sender", type: "address"},
                {name: "receiver", type: "address"},
                {name: "isinAddr", type: "address"},
                {name: "value", type: "uint256"},
                {name: "customValue", type: "uint256"},
            ],
        };

        resolveTransferOrderTypes = {
            CancelTransferOrder: {
                CancelTransferOrder: [
                    {name: "orderHash", type: "bytes32"},
                    {name: "deadline", type: "uint256"},
                ]
            },
            AcceptTransferOrder: {
                AcceptTransferOrder: [
                    {name: "orderHash", type: "bytes32"},
                    {name: "deadline", type: "uint256"},
                ]
            },
            RejectTransferOrder: {
                RejectTransferOrder: [
                    {name: "orderHash", type: "bytes32"},
                    {name: "deadline", type: "uint256"},
                ]
            },
        };
    });

    describe("Create transfer order", function () {
        it("Should initialize the contract with correct values", async function () {
            expect(await isinEscrow.owner()).to.equal(await owner.getAddress());
        });

        it("Should create transfer order with a valid signature", async function () {
            const {transferOrder, deadline, v, r, s} = await prepareTransferOrderParams();

            await expect(await isinEscrow.createTransferOrder(transferOrder, deadline, v, r, s))
                .to.emit(isinEscrow, "IsinTransferOrderCreated")
                .withArgs(() => true, await user1.getAddress(), await user2.getAddress(), transferOrder.isinAddr, transferOrder.value, transferOrder.customValue);

            // Check balances after transfer order
            expect(await isinPermit.balanceOf(await user1.getAddress())).to.equal(40);
            expect(await isinPermit.balanceOf(await isinEscrow.getAddress())).to.equal(60);
        });

        it("Should fail to create transfer order with insufficient allowance", async function () {
            const {transferOrder, deadline, v, r, s} = await prepareTransferOrderParams(undefined, 70);

            await expect(
                isinEscrow.createTransferOrder(transferOrder, deadline, v, r, s)
            ).to.be.revertedWithCustomError(isinPermit, "ERC20InsufficientAllowance");
        });

        it("Should fail to create transfer order with an expired permit", async function () {
            // Prepare transfer order data with expired deadline
            const {transferOrder, deadline, v, r, s} = await prepareTransferOrderParams(Math.floor(Date.now() / 1000) - 100);

            // Attempt to create transfer order using expired permit
            await expect(
                isinEscrow.createTransferOrder(transferOrder, deadline, v, r, s)
            ).to.be.revertedWithCustomError(isinEscrow, "EscrowExpiredSignature");
        });

        it("Should fail to create transfer order with an invalid signature", async function () {
            const {transferOrder, deadline, v, r, s} = await prepareTransferOrderParams();
            transferOrder.sender = await user2.getAddress();
            transferOrder.receiver = await user1.getAddress();

            // Attempt to create transfer order with tampered signature
            await expect(
                isinEscrow.createTransferOrder(transferOrder, deadline, v, r, s)
            ).to.be.revertedWithCustomError(isinEscrow, "EscrowInvalidSigner")
        });

        it("Should fail to create transfer order with sender not in investor whitelist", async function () {
            //remove user1
            await investorWhiteList.connect(investorManager).removeInvestor(await user1.getAddress());

            const {transferOrder, deadline, v, r, s} = await prepareTransferOrderParams();

            await expect(
                isinEscrow.createTransferOrder(transferOrder, deadline, v, r, s)
            ).to.be.revertedWithCustomError(investorWhiteList, "InvestorNotFound").withArgs(await user1.getAddress());
        });

        it("Should fail to create transfer order with sender blocked in investor whitelist", async function () {
            //block user1
            await investorWhiteList.connect(investorManager).blockInvestor(await user1.getAddress());

            const {transferOrder, deadline, v, r, s} = await prepareTransferOrderParams();

            await expect(
                isinEscrow.createTransferOrder(transferOrder, deadline, v, r, s)
            ).to.be.revertedWithCustomError(investorWhiteList, "InvestorBlocked").withArgs(await user1.getAddress());
        });

        it("Should fail to create transfer order with sender is not allowed to use ES type", async function () {
            //remove user1 allowed isin type
            await investorWhiteList.connect(investorManager).addAllowedIsinType(await user1.getAddress(), "DB");
            await investorWhiteList.connect(investorManager).removeAllowedIsinType(await user1.getAddress(), "ES");

            const {transferOrder, deadline, v, r, s} = await prepareTransferOrderParams();

            await expect(
                isinEscrow.createTransferOrder(transferOrder, deadline, v, r, s)
            ).to.be.revertedWithCustomError(investorWhiteList, "IsinTypeNotAllowedForInvestor").withArgs(await user1.getAddress());
        });

        it("Should fail to create transfer order with receiver not in investor whitelist", async function () {
            //remove user2
            await investorWhiteList.connect(investorManager).removeInvestor(await user2.getAddress());

            const {transferOrder, deadline, v, r, s} = await prepareTransferOrderParams();

            await expect(
                isinEscrow.createTransferOrder(transferOrder, deadline, v, r, s)
            ).to.be.revertedWithCustomError(investorWhiteList, "InvestorNotFound").withArgs(await user2.getAddress());
        });

        it("Should fail to create transfer order with receiver blocked in investor whitelist", async function () {
            // block user2
            await investorWhiteList.connect(investorManager).blockInvestor(await user2.getAddress());

            const {transferOrder, deadline, v, r, s} = await prepareTransferOrderParams();

            await expect(
                isinEscrow.createTransferOrder(transferOrder, deadline, v, r, s)
            ).to.be.revertedWithCustomError(investorWhiteList, "InvestorBlocked").withArgs(await user2.getAddress());
        });

        it("Should fail to create transfer order with receiver not allowed to use ES type", async function () {
            //remove user2 allowed isin type
            await investorWhiteList.connect(investorManager).removeAllowedIsinType(await user2.getAddress(), "ES");

            const {transferOrder, deadline, v, r, s} = await prepareTransferOrderParams();

            await expect(
                isinEscrow.createTransferOrder(transferOrder, deadline, v, r, s)
            ).to.be.revertedWithCustomError(investorWhiteList, "IsinTypeNotAllowedForInvestor").withArgs(await user2.getAddress());
        });


        it("Should fail to create transfer order with isin blocked", async function () {
            //block isin
            await isinWhiteList.connect(isinManager).blockIsin(isin);

            const {transferOrder, deadline, v, r, s} = await prepareTransferOrderParams();

            await expect(
                isinEscrow.createTransferOrder(transferOrder, deadline, v, r, s)
            ).to.be.revertedWithCustomError(isinWhiteList, "IsinBlocked");
        });

        it("Should fail to create transfer order with isin removed", async function () {
            //remove isin
            await isinPermit.connect(mintBurnManager).burn(await user1.getAddress(), 100);
            await isinWhiteList.connect(isinManager).removeIsin(isin);

            const {transferOrder, deadline, v, r, s} = await prepareTransferOrderParams();

            await expect(
                isinEscrow.createTransferOrder(transferOrder, deadline, v, r, s)
            ).to.be.revertedWithCustomError(isinWhiteList, "IsinNotFound");
        });

        it("Should fail on insufficient balance", async function () {
            const {transferOrder, deadline, v, r, s} = await prepareTransferOrderParams(undefined, 120);

            await expect(
                isinEscrow.createTransferOrder(transferOrder, deadline, v, r, s)
            ).to.be.revertedWithCustomError(isinPermit, "ERC20InsufficientBalance")
                .withArgs(await user1.getAddress(), 100, 120);
        });
    });

    describe("Accept transfer order", function () {

        it("Should accept transfer order with a valid receiver signature", async function () {
            const txn = await isinEscrow.createTransferOrder(...Object.values(await prepareTransferOrderParams()))
            const orderHash = (await txn.wait()).logs[1].args[0];

            const {deadline, v, r, s} = await prepareResolveTransferOrderParams(resolveTransferOrderTypes.AcceptTransferOrder, user2, orderHash);

            await expect(await isinEscrow.acceptTransferOrder(orderHash, deadline, v, r, s))
                .to.emit(isinEscrow, "IsinTransferOrderCompleted")
                .withArgs(() => true, await user1.getAddress(), await user2.getAddress(), await isinPermit.getAddress(), 60, 20000);

            // tokens should be sent to receiver
            expect(await isinPermit.balanceOf(await user1.getAddress())).to.equal(40);
            expect(await isinPermit.balanceOf(await isinEscrow.getAddress())).to.equal(0);
            expect(await isinPermit.balanceOf(await user2.getAddress())).to.equal(60);
        });

        it("Should fail to accept transfer order with an expired permit", async function () {
            const txn = await isinEscrow.createTransferOrder(...Object.values(await prepareTransferOrderParams()))
            const orderHash = (await txn.wait()).logs[1].args[0];

            // Prepare transfer order data with expired deadline
            let {deadline, v, r, s} = await prepareResolveTransferOrderParams(resolveTransferOrderTypes.AcceptTransferOrder, user2, orderHash, Math.floor(Date.now() / 1000) - 100);

            // Attempt to accept transfer order using expired permit
            await expect(
                isinEscrow.acceptTransferOrder(orderHash, deadline, v, r, s)
            ).to.be.revertedWithCustomError(isinEscrow, "EscrowExpiredSignature");
        });

        it("Should fail to accept transfer order with sender signature", async function () {
            const txn = await isinEscrow.createTransferOrder(...Object.values(await prepareTransferOrderParams()))
            const orderHash = (await txn.wait()).logs[1].args[0];

            const {deadline, v, r, s} = await prepareResolveTransferOrderParams(resolveTransferOrderTypes.AcceptTransferOrder, user1, orderHash);

            // Attempt to accept transfer order with tampered signature
            await expect(
                isinEscrow.acceptTransferOrder(orderHash, deadline, v, r, s)
            ).to.be.revertedWithCustomError(isinEscrow, "EscrowInvalidSigner");
        });

        it("Should fail to accept transfer order with sender not in investor whitelist", async function () {
            const txn = await isinEscrow.createTransferOrder(...Object.values(await prepareTransferOrderParams()))
            const orderHash = (await txn.wait()).logs[1].args[0];

            //remove user1
            await investorWhiteList.connect(investorManager).removeInvestor(await user1.getAddress());

            const {deadline, v, r, s} = await prepareResolveTransferOrderParams(resolveTransferOrderTypes.AcceptTransferOrder, user2, orderHash);

            await expect(
                isinEscrow.acceptTransferOrder(orderHash, deadline, v, r, s)
            ).to.be.revertedWithCustomError(investorWhiteList, "InvestorNotFound").withArgs(await user1.getAddress());
        });

        it("Should fail to accept transfer order with sender blocked in investor whitelist", async function () {
            const txn = await isinEscrow.createTransferOrder(...Object.values(await prepareTransferOrderParams()))
            const orderHash = (await txn.wait()).logs[1].args[0];

            //block user1
            await investorWhiteList.connect(investorManager).blockInvestor(await user1.getAddress());

            const {deadline, v, r, s} = await prepareResolveTransferOrderParams(resolveTransferOrderTypes.AcceptTransferOrder, user2, orderHash);

            await expect(
                isinEscrow.acceptTransferOrder(orderHash, deadline, v, r, s)
            ).to.be.revertedWithCustomError(investorWhiteList, "InvestorBlocked").withArgs(await user1.getAddress());
        });

        it("Should fail to accept transfer order with sender is not allowed to use ES type", async function () {
            const txn = await isinEscrow.createTransferOrder(...Object.values(await prepareTransferOrderParams()))
            const orderHash = (await txn.wait()).logs[1].args[0];

            //remove user1 allowed isin type
            await investorWhiteList.connect(investorManager).addAllowedIsinType(await user1.getAddress(), "DB");
            await investorWhiteList.connect(investorManager).removeAllowedIsinType(await user1.getAddress(), "ES");

            const {deadline, v, r, s} = await prepareResolveTransferOrderParams(resolveTransferOrderTypes.AcceptTransferOrder, user2, orderHash);

            await expect(
                isinEscrow.acceptTransferOrder(orderHash, deadline, v, r, s)
            ).to.be.revertedWithCustomError(investorWhiteList, "IsinTypeNotAllowedForInvestor").withArgs(await user1.getAddress());
        });

        it("Should fail to accept transfer order with receiver not in investor whitelist", async function () {
            const txn = await isinEscrow.createTransferOrder(...Object.values(await prepareTransferOrderParams()))
            const orderHash = (await txn.wait()).logs[1].args[0];

            //remove user2
            await investorWhiteList.connect(investorManager).removeInvestor(await user2.getAddress());

            const {deadline, v, r, s} = await prepareResolveTransferOrderParams(resolveTransferOrderTypes.AcceptTransferOrder, user2, orderHash);

            await expect(
                isinEscrow.acceptTransferOrder(orderHash, deadline, v, r, s)
            ).to.be.revertedWithCustomError(investorWhiteList, "InvestorNotFound").withArgs(await user2.getAddress());
        });

        it("Should fail to accept transfer order with receiver blocked in investor whitelist", async function () {
            const txn = await isinEscrow.createTransferOrder(...Object.values(await prepareTransferOrderParams()))
            const orderHash = (await txn.wait()).logs[1].args[0];

            // block user2
            await investorWhiteList.connect(investorManager).blockInvestor(await user2.getAddress());

            const {deadline, v, r, s} = await prepareResolveTransferOrderParams(resolveTransferOrderTypes.AcceptTransferOrder, user2, orderHash);

            await expect(
                isinEscrow.acceptTransferOrder(orderHash, deadline, v, r, s)
            ).to.be.revertedWithCustomError(investorWhiteList, "InvestorBlocked").withArgs(await user2.getAddress());
        });

        it("Should fail to accept transfer order with receiver not allowed to use ES type", async function () {
            const txn = await isinEscrow.createTransferOrder(...Object.values(await prepareTransferOrderParams()))
            const orderHash = (await txn.wait()).logs[1].args[0];

            //remove user2 allowed isin type
            await investorWhiteList.connect(investorManager).removeAllowedIsinType(await user2.getAddress(), "ES");

            const {deadline, v, r, s} = await prepareResolveTransferOrderParams(resolveTransferOrderTypes.AcceptTransferOrder, user2, orderHash);

            await expect(
                isinEscrow.acceptTransferOrder(orderHash, deadline, v, r, s)
            ).to.be.revertedWithCustomError(investorWhiteList, "IsinTypeNotAllowedForInvestor").withArgs(await user2.getAddress());
        });


        it("Should fail to accept transfer order with isin blocked", async function () {
            const txn = await isinEscrow.createTransferOrder(...Object.values(await prepareTransferOrderParams()))
            const orderHash = (await txn.wait()).logs[1].args[0];

            //block isin
            await isinWhiteList.connect(isinManager).blockIsin(isin);

            const {deadline, v, r, s} = await prepareResolveTransferOrderParams(resolveTransferOrderTypes.AcceptTransferOrder, user2, orderHash);

            await expect(
                isinEscrow.acceptTransferOrder(orderHash, deadline, v, r, s)
            ).to.be.revertedWithCustomError(isinWhiteList, "IsinBlocked");
        });

        it("Should fail to accept transfer order with isin removed", async function () {
            const txn = await isinEscrow.createTransferOrder(...Object.values(await prepareTransferOrderParams()))
            const orderHash = (await txn.wait()).logs[1].args[0];

            //remove isin
            await isinPermit.connect(mintBurnManager).burn(await user1.getAddress(), 40);
            await isinPermit.connect(mintBurnManager).burn(await isinEscrow.getAddress(), 60);
            await isinWhiteList.connect(isinManager).removeIsin(isin);

            const {deadline, v, r, s} = await prepareResolveTransferOrderParams(resolveTransferOrderTypes.AcceptTransferOrder, user2, orderHash);

            await expect(
                isinEscrow.acceptTransferOrder(orderHash, deadline, v, r, s)
            ).to.be.revertedWithCustomError(isinWhiteList, "IsinNotFound");
        });
    });

    describe("Reject transfer order", function () {

        it("Should reject transfer order with a valid receiver signature", async function () {
            const txn = await isinEscrow.createTransferOrder(...Object.values(await prepareTransferOrderParams()))
            const orderHash = (await txn.wait()).logs[1].args[0];

            const {deadline, v, r, s} = await prepareResolveTransferOrderParams(resolveTransferOrderTypes.RejectTransferOrder, user2, orderHash);

            await expect(await isinEscrow.rejectTransferOrder(orderHash, deadline, v, r, s))
                .to.emit(isinEscrow, "IsinTransferOrderRejected")
                .withArgs(() => true, await user1.getAddress(), await user2.getAddress(), await isinPermit.getAddress(), 60, 20000);

            // tokens should be returned to the sender
            expect(await isinPermit.balanceOf(await user1.getAddress())).to.equal(100);
            expect(await isinPermit.balanceOf(await isinEscrow.getAddress())).to.equal(0);
            expect(await isinPermit.balanceOf(await user2.getAddress())).to.equal(0);
        });

        it("Should fail to reject transfer order with an expired permit", async function () {
            const txn = await isinEscrow.createTransferOrder(...Object.values(await prepareTransferOrderParams()))
            const orderHash = (await txn.wait()).logs[1].args[0];

            // Prepare transfer order data with expired deadline
            let {deadline, v, r, s} = await prepareResolveTransferOrderParams(resolveTransferOrderTypes.RejectTransferOrder, user2, orderHash, Math.floor(Date.now() / 1000) - 100);

            // Attempt to reject transfer order using expired permit
            await expect(
                isinEscrow.rejectTransferOrder(orderHash, deadline, v, r, s)
            ).to.be.revertedWithCustomError(isinEscrow, "EscrowExpiredSignature");
        });

        it("Should fail to reject transfer order with sender signature", async function () {
            const txn = await isinEscrow.createTransferOrder(...Object.values(await prepareTransferOrderParams()))
            const orderHash = (await txn.wait()).logs[1].args[0];

            const {deadline, v, r, s} = await prepareResolveTransferOrderParams(resolveTransferOrderTypes.RejectTransferOrder, user1, orderHash);

            // Attempt to reject transfer order with tampered signature
            await expect(
                isinEscrow.rejectTransferOrder(orderHash, deadline, v, r, s)
            ).to.be.revertedWithCustomError(isinEscrow, "EscrowInvalidSigner");
        });

        it("Should fail to reject transfer order with sender not in investor whitelist", async function () {
            const txn = await isinEscrow.createTransferOrder(...Object.values(await prepareTransferOrderParams()))
            const orderHash = (await txn.wait()).logs[1].args[0];

            //remove user1
            await investorWhiteList.connect(investorManager).removeInvestor(await user1.getAddress());

            const {deadline, v, r, s} = await prepareResolveTransferOrderParams(resolveTransferOrderTypes.RejectTransferOrder, user2, orderHash);

            await expect(
                isinEscrow.rejectTransferOrder(orderHash, deadline, v, r, s)
            ).to.be.revertedWithCustomError(investorWhiteList, "InvestorNotFound").withArgs(await user1.getAddress());
        });

        it("Should fail to reject transfer order with sender blocked in investor whitelist", async function () {
            const txn = await isinEscrow.createTransferOrder(...Object.values(await prepareTransferOrderParams()))
            const orderHash = (await txn.wait()).logs[1].args[0];

            //block user1
            await investorWhiteList.connect(investorManager).blockInvestor(await user1.getAddress());

            const {deadline, v, r, s} = await prepareResolveTransferOrderParams(resolveTransferOrderTypes.RejectTransferOrder, user2, orderHash);

            await expect(
                isinEscrow.rejectTransferOrder(orderHash, deadline, v, r, s)
            ).to.be.revertedWithCustomError(investorWhiteList, "InvestorBlocked").withArgs(await user1.getAddress());
        });

        it("Should fail to reject transfer order with sender is not allowed to use ES type", async function () {
            const txn = await isinEscrow.createTransferOrder(...Object.values(await prepareTransferOrderParams()))
            const orderHash = (await txn.wait()).logs[1].args[0];

            //remove user1 allowed isin type
            await investorWhiteList.connect(investorManager).addAllowedIsinType(await user1.getAddress(), "DB");
            await investorWhiteList.connect(investorManager).removeAllowedIsinType(await user1.getAddress(), "ES");

            const {deadline, v, r, s} = await prepareResolveTransferOrderParams(resolveTransferOrderTypes.RejectTransferOrder, user2, orderHash);

            await expect(
                isinEscrow.rejectTransferOrder(orderHash, deadline, v, r, s)
            ).to.be.revertedWithCustomError(investorWhiteList, "IsinTypeNotAllowedForInvestor").withArgs(await user1.getAddress());
        });

        it("Should fail to reject transfer order with receiver not in investor whitelist", async function () {
            const txn = await isinEscrow.createTransferOrder(...Object.values(await prepareTransferOrderParams()))
            const orderHash = (await txn.wait()).logs[1].args[0];

            //remove user2
            await investorWhiteList.connect(investorManager).removeInvestor(await user2.getAddress());

            const {deadline, v, r, s} = await prepareResolveTransferOrderParams(resolveTransferOrderTypes.RejectTransferOrder, user2, orderHash);

            await expect(
                isinEscrow.rejectTransferOrder(orderHash, deadline, v, r, s)
            ).to.be.revertedWithCustomError(investorWhiteList, "InvestorNotFound").withArgs(await user2.getAddress());
        });

        it("Should fail to reject transfer order with receiver blocked in investor whitelist", async function () {
            const txn = await isinEscrow.createTransferOrder(...Object.values(await prepareTransferOrderParams()))
            const orderHash = (await txn.wait()).logs[1].args[0];

            // block user2
            await investorWhiteList.connect(investorManager).blockInvestor(await user2.getAddress());

            const {deadline, v, r, s} = await prepareResolveTransferOrderParams(resolveTransferOrderTypes.RejectTransferOrder, user2, orderHash);

            await expect(
                isinEscrow.rejectTransferOrder(orderHash, deadline, v, r, s)
            ).to.be.revertedWithCustomError(investorWhiteList, "InvestorBlocked").withArgs(await user2.getAddress());
        });

        it("Should fail to reject transfer order with receiver not allowed to use ES type", async function () {
            const txn = await isinEscrow.createTransferOrder(...Object.values(await prepareTransferOrderParams()))
            const orderHash = (await txn.wait()).logs[1].args[0];

            //remove user2 allowed isin type
            await investorWhiteList.connect(investorManager).removeAllowedIsinType(await user2.getAddress(), "ES");

            const {deadline, v, r, s} = await prepareResolveTransferOrderParams(resolveTransferOrderTypes.RejectTransferOrder, user2, orderHash);

            await expect(
                isinEscrow.rejectTransferOrder(orderHash, deadline, v, r, s)
            ).to.be.revertedWithCustomError(investorWhiteList, "IsinTypeNotAllowedForInvestor").withArgs(await user2.getAddress());
        });


        it("Should fail to reject transfer order with isin blocked", async function () {
            const txn = await isinEscrow.createTransferOrder(...Object.values(await prepareTransferOrderParams()))
            const orderHash = (await txn.wait()).logs[1].args[0];

            //block isin
            await isinWhiteList.connect(isinManager).blockIsin(isin);

            const {deadline, v, r, s} = await prepareResolveTransferOrderParams(resolveTransferOrderTypes.RejectTransferOrder, user2, orderHash);

            await expect(
                isinEscrow.rejectTransferOrder(orderHash, deadline, v, r, s)
            ).to.be.revertedWithCustomError(isinWhiteList, "IsinBlocked");
        });

        it("Should fail to reject transfer order with isin removed", async function () {
            const txn = await isinEscrow.createTransferOrder(...Object.values(await prepareTransferOrderParams()))
            const orderHash = (await txn.wait()).logs[1].args[0];

            //remove isin
            await isinPermit.connect(mintBurnManager).burn(await user1.getAddress(), 40);
            await isinPermit.connect(mintBurnManager).burn(await isinEscrow.getAddress(), 60);
            await isinWhiteList.connect(isinManager).removeIsin(isin);

            const {deadline, v, r, s} = await prepareResolveTransferOrderParams(resolveTransferOrderTypes.RejectTransferOrder, user2, orderHash);

            await expect(
                isinEscrow.rejectTransferOrder(orderHash, deadline, v, r, s)
            ).to.be.revertedWithCustomError(isinWhiteList, "IsinNotFound");
        });
    });

    describe("Cancel transfer order", function () {

        it("Should accept transfer order with a valid sender signature", async function () {
            const txn = await isinEscrow.createTransferOrder(...Object.values(await prepareTransferOrderParams()))
            const orderHash = (await txn.wait()).logs[1].args[0];

            const {deadline, v, r, s} = await prepareResolveTransferOrderParams(resolveTransferOrderTypes.CancelTransferOrder, user1, orderHash);

            await expect(await isinEscrow.cancelTransferOrder(orderHash, deadline, v, r, s))
                .to.emit(isinEscrow, "IsinTransferOrderCancelled")
                .withArgs(() => true, await user1.getAddress(), await user2.getAddress(), await isinPermit.getAddress(), 60, 20000);

            // tokens should be returned to sender
            expect(await isinPermit.balanceOf(await user1.getAddress())).to.equal(100);
            expect(await isinPermit.balanceOf(await isinEscrow.getAddress())).to.equal(0);
            expect(await isinPermit.balanceOf(await user2.getAddress())).to.equal(0);
        });

        it("Should fail to cancel transfer order with an expired permit", async function () {
            const txn = await isinEscrow.createTransferOrder(...Object.values(await prepareTransferOrderParams()))
            const orderHash = (await txn.wait()).logs[1].args[0];

            // Prepare transfer order data with expired deadline
            let {deadline, v, r, s} = await prepareResolveTransferOrderParams(resolveTransferOrderTypes.CancelTransferOrder, user1, orderHash, Math.floor(Date.now() / 1000) - 100);

            // Attempt to cancel transfer order using expired permit
            await expect(
                isinEscrow.cancelTransferOrder(orderHash, deadline, v, r, s)
            ).to.be.revertedWithCustomError(isinEscrow, "EscrowExpiredSignature");
        });

        it("Should fail to cancel transfer order with receiver signature", async function () {
            const txn = await isinEscrow.createTransferOrder(...Object.values(await prepareTransferOrderParams()))
            const orderHash = (await txn.wait()).logs[1].args[0];

            const {deadline, v, r, s} = await prepareResolveTransferOrderParams(resolveTransferOrderTypes.CancelTransferOrder, user2, orderHash);

            // Attempt to cancel transfer order with tampered signature
            await expect(
                isinEscrow.cancelTransferOrder(orderHash, deadline, v, r, s)
            ).to.be.revertedWithCustomError(isinEscrow, "EscrowInvalidSigner");
        });

        it("Should fail to cancel transfer order with sender not in investor whitelist", async function () {
            const txn = await isinEscrow.createTransferOrder(...Object.values(await prepareTransferOrderParams()))
            const orderHash = (await txn.wait()).logs[1].args[0];

            //remove user1
            await investorWhiteList.connect(investorManager).removeInvestor(await user1.getAddress());

            const {deadline, v, r, s} = await prepareResolveTransferOrderParams(resolveTransferOrderTypes.CancelTransferOrder, user1, orderHash);

            await expect(
                isinEscrow.cancelTransferOrder(orderHash, deadline, v, r, s)
            ).to.be.revertedWithCustomError(investorWhiteList, "InvestorNotFound").withArgs(await user1.getAddress());
        });

        it("Should fail to cancel transfer order with sender blocked in investor whitelist", async function () {
            const txn = await isinEscrow.createTransferOrder(...Object.values(await prepareTransferOrderParams()))
            const orderHash = (await txn.wait()).logs[1].args[0];

            //block user1
            await investorWhiteList.connect(investorManager).blockInvestor(await user1.getAddress());

            const {deadline, v, r, s} = await prepareResolveTransferOrderParams(resolveTransferOrderTypes.CancelTransferOrder, user1, orderHash);

            await expect(
                isinEscrow.cancelTransferOrder(orderHash, deadline, v, r, s)
            ).to.be.revertedWithCustomError(investorWhiteList, "InvestorBlocked").withArgs(await user1.getAddress());
        });

        it("Should fail to cancel transfer order with sender is not allowed to use ES type", async function () {
            const txn = await isinEscrow.createTransferOrder(...Object.values(await prepareTransferOrderParams()))
            const orderHash = (await txn.wait()).logs[1].args[0];

            //remove user1 allowed isin type
            await investorWhiteList.connect(investorManager).addAllowedIsinType(await user1.getAddress(), "DB");
            await investorWhiteList.connect(investorManager).removeAllowedIsinType(await user1.getAddress(), "ES");

            const {deadline, v, r, s} = await prepareResolveTransferOrderParams(resolveTransferOrderTypes.CancelTransferOrder, user1, orderHash);

            await expect(
                isinEscrow.cancelTransferOrder(orderHash, deadline, v, r, s)
            ).to.be.revertedWithCustomError(investorWhiteList, "IsinTypeNotAllowedForInvestor").withArgs(await user1.getAddress());
        });

        it("Should fail to cancel transfer order with receiver not in investor whitelist", async function () {
            const txn = await isinEscrow.createTransferOrder(...Object.values(await prepareTransferOrderParams()))
            const orderHash = (await txn.wait()).logs[1].args[0];

            //remove user2
            await investorWhiteList.connect(investorManager).removeInvestor(await user2.getAddress());

            const {deadline, v, r, s} = await prepareResolveTransferOrderParams(resolveTransferOrderTypes.CancelTransferOrder, user1, orderHash);

            await expect(
                isinEscrow.cancelTransferOrder(orderHash, deadline, v, r, s)
            ).to.be.revertedWithCustomError(investorWhiteList, "InvestorNotFound").withArgs(await user2.getAddress());
        });

        it("Should fail to cancel transfer order with receiver blocked in investor whitelist", async function () {
            const txn = await isinEscrow.createTransferOrder(...Object.values(await prepareTransferOrderParams()))
            const orderHash = (await txn.wait()).logs[1].args[0];

            // block user2
            await investorWhiteList.connect(investorManager).blockInvestor(await user2.getAddress());

            const {deadline, v, r, s} = await prepareResolveTransferOrderParams(resolveTransferOrderTypes.CancelTransferOrder, user1, orderHash);

            await expect(
                isinEscrow.cancelTransferOrder(orderHash, deadline, v, r, s)
            ).to.be.revertedWithCustomError(investorWhiteList, "InvestorBlocked").withArgs(await user2.getAddress());
        });

        it("Should fail to cancel transfer order with receiver not allowed to use ES type", async function () {
            const txn = await isinEscrow.createTransferOrder(...Object.values(await prepareTransferOrderParams()))
            const orderHash = (await txn.wait()).logs[1].args[0];

            //remove user2 allowed isin type
            await investorWhiteList.connect(investorManager).removeAllowedIsinType(await user2.getAddress(), "ES");

            const {deadline, v, r, s} = await prepareResolveTransferOrderParams(resolveTransferOrderTypes.CancelTransferOrder, user1, orderHash);

            await expect(
                isinEscrow.cancelTransferOrder(orderHash, deadline, v, r, s)
            ).to.be.revertedWithCustomError(investorWhiteList, "IsinTypeNotAllowedForInvestor").withArgs(await user2.getAddress());
        });


        it("Should fail to cancel transfer order with isin blocked", async function () {
            const txn = await isinEscrow.createTransferOrder(...Object.values(await prepareTransferOrderParams()))
            const orderHash = (await txn.wait()).logs[1].args[0];

            //block isin
            await isinWhiteList.connect(isinManager).blockIsin(isin);

            const {deadline, v, r, s} = await prepareResolveTransferOrderParams(resolveTransferOrderTypes.CancelTransferOrder, user1, orderHash);

            await expect(
                isinEscrow.cancelTransferOrder(orderHash, deadline, v, r, s)
            ).to.be.revertedWithCustomError(isinWhiteList, "IsinBlocked");
        });

        it("Should fail to cancel transfer order with isin removed", async function () {
            const txn = await isinEscrow.createTransferOrder(...Object.values(await prepareTransferOrderParams()))
            const orderHash = (await txn.wait()).logs[1].args[0];

            //remove isin
            await isinPermit.connect(mintBurnManager).burn(await user1.getAddress(), 40);
            await isinPermit.connect(mintBurnManager).burn(await isinEscrow.getAddress(), 60);
            await isinWhiteList.connect(isinManager).removeIsin(isin);

            const {deadline, v, r, s} = await prepareResolveTransferOrderParams(resolveTransferOrderTypes.CancelTransferOrder, user1, orderHash);

            await expect(
                isinEscrow.cancelTransferOrder(orderHash, deadline, v, r, s)
            ).to.be.revertedWithCustomError(isinWhiteList, "IsinNotFound");
        });
    });
});
