import {task} from "hardhat/config";
import {getContractAddr, handleContractError, waitForTransactionReceipt} from "../scripts/utils";
import {HardhatRuntimeEnvironment} from "hardhat/types";
import {
    IsinEscrowContractName, IsinEscrowProxyName, IsinPermitName,
    IsinWhitelistContractName,
    IsinWhitelistProxyName
} from "../scripts/consts";

async function getIsinWhitelist(hre: HardhatRuntimeEnvironment) {
    const chainId = await (await hre.viem.getPublicClient()).getChainId();
    const whiteListAddr = getContractAddr(chainId, IsinWhitelistProxyName)
    const whiteList = await hre.viem.getContractAt(
        IsinWhitelistContractName,
        whiteListAddr
    );
    const isins = await whiteList.read.listIsins();
    return isins.filter(isin => isin.deleted === false);
}

async function getIsin(hre: HardhatRuntimeEnvironment, _isin: string) {
    const isins = await getIsinWhitelist(hre);
    return isins.find(isin => isin.isin === _isin);
}

async function getContract(hre: HardhatRuntimeEnvironment) {
    const chainId = await (await hre.viem.getPublicClient()).getChainId();
    const isinEscrow = getContractAddr(chainId, IsinEscrowProxyName)
    return await hre.viem.getContractAt(
        IsinEscrowContractName,
        isinEscrow
    );
}

task("escrowCreate")
    .addParam("isin")
    .addParam("from")
    .addParam("to")
    .addParam("amount")
    .addOptionalParam("customvalue")
    .addOptionalParam("senderprivatekey")
    .setAction(async (taskArgs, hre) => {
        const isin = await getIsin(hre, taskArgs.isin);
        if (!isin) {
            console.error(`Isin not found: ${taskArgs.isin}`)
            return;
        }

        const escrow = await getContract(hre);

        const token = await hre.viem.getContractAt(
            IsinPermitName,
            isin.addr
        );

        const chainId = await (await hre.viem.getPublicClient()).getChainId();

        const domain = {
            name: "IsinEscrow",
            version: "1",
            chainId: await (await hre.viem.getPublicClient()).getChainId(),
            verifyingContract: getContractAddr(chainId, IsinEscrowProxyName),
        };

        const types = {
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

        // Prepare the permit data
        const orderData = {
            data:{
                sender: taskArgs.from,
                receiver: taskArgs.to,
                isinAddr: isin.addr,
                value: taskArgs.amount,
                customValue: taskArgs.customvalue || 0,
            },
            nonce: await escrow.read.nonces([taskArgs.from]),
            deadline: Math.floor(Date.now() / 1000) + 3600 // 1 hour from now
        };


        const permitDomain = {
            name: isin.isin,
            version: "1",
            chainId: await (await hre.viem.getPublicClient()).getChainId(),
            verifyingContract: isin.addr,
        };

        const permitTypes = {
            Approve: [
                {name: "owner", type: "address"},
                {name: "to", type: "address"},
                {name: "deposit", type: "address"},
                {name: "value", type: "uint256"},
                {name: "nonce", type: "uint256"},
                {name: "deadline", type: "uint256"},
            ],
        };

        // Prepare the permit data
        const permitData = {
            owner: taskArgs.from,
            to: taskArgs.to,
            deposit: getContractAddr(chainId, IsinEscrowProxyName),
            value: taskArgs.amount,
            nonce: await token.read.nonces([taskArgs.from]),
            deadline: orderData.deadline // 1 hour from now
        };

        // Sign the data using EIP-712
        const signer = taskArgs.senderprivatekey ? new hre.ethers.Wallet(taskArgs.senderprivatekey, hre.ethers.provider)
            : await hre.ethers.getSigner(taskArgs.from);
        const permitSignature = await signer.signTypedData(permitDomain, permitTypes, permitData);
        const signature = await signer.signTypedData(domain, types, orderData);

        const r = signature.slice(0, 66) as `0x${string}`;
        const s = "0x" + signature.slice(66, 130) as `0x${string}`;
        const v = parseInt(signature.slice(130, 132), 16);

        const pr = permitSignature.slice(0, 66) as `0x${string}`;
        const ps = "0x" + permitSignature.slice(66, 130) as `0x${string}`;
        const pv = parseInt(permitSignature.slice(130, 132), 16);

        try {
            let txnHash = await token.write.approvePermit([taskArgs.from, permitData.to, permitData.deposit, taskArgs.amount, BigInt(permitData.deadline), pv, pr, ps]);
            await waitForTransactionReceipt(hre, txnHash);
            console.log(`Approved ${taskArgs.amount} transfer of ${taskArgs.amount} ${isin.isin} from: ${permitData.owner} to: ${permitData.deposit}`)

            txnHash = await escrow.write.createTransferOrder([orderData.data, BigInt(orderData.deadline), v, r, s]);
            await waitForTransactionReceipt(hre, txnHash);
            console.log(`Created transfer order of ${taskArgs.amount} ${isin.isin} from: ${taskArgs.from} to: ${taskArgs.to}. custom value: ${taskArgs.customvalue}`)
        } catch (error: any) {
            await handleContractError(hre, error)
        }

        console.log(`{
            "signedData": "${signature}",
            "signedPermitData": "${permitSignature}",
            "contractAddr": "${isin.addr}",
            "to": "${taskArgs.to}",
            "value": ${taskArgs.amount},
            "customValue": ${orderData.data.customValue},
            "deadline": ${orderData.deadline}
            }`)
    });

task("escrowCancel")
    .addParam("orderhash")
    .addParam("sender")
    .addOptionalParam("senderprivatekey")
    .setAction(async (taskArgs, hre) => {
        const escrow = await getContract(hre);

        const chainId = await (await hre.viem.getPublicClient()).getChainId();

        const types = {
            CancelTransferOrder: [
                {name: "orderHash", type: "bytes32"},
                {name: "deadline", type: "uint256"},
            ],
        };

        // Prepare the permit data
        const orderData = {
            orderHash: taskArgs.orderhash,
            deadline: Math.floor(Date.now() / 1000) + 3600 // 1 hour from now
        };


        const domain = {
            name: "IsinEscrow",
            version: "1",
            chainId: chainId,
            verifyingContract: getContractAddr(chainId, IsinEscrowProxyName),
        };

        // Sign the data using EIP-712
        const signer = taskArgs.senderprivatekey ? new hre.ethers.Wallet(taskArgs.senderprivatekey, hre.ethers.provider)
            : await hre.ethers.getSigner(taskArgs.sender);
        const signature = await signer.signTypedData(domain, types, orderData);

        const r = signature.slice(0, 66) as `0x${string}`;
        const s = "0x" + signature.slice(66, 130) as `0x${string}`;
        const v = parseInt(signature.slice(130, 132), 16);

        try {
            const txnHash = await escrow.write.cancelTransferOrder([taskArgs.orderhash, BigInt(orderData.deadline), v, r, s]);
            await waitForTransactionReceipt(hre, txnHash);
            console.log(`Order ${taskArgs.orderhash} cancelled by ${taskArgs.sender}`)
        } catch (error: any) {
            await handleContractError(hre, error)
        }

        console.log(`{
            "hashLockId": "${orderData.orderHash}",
            "signedData": "${signature}",
            "Deadline": ${orderData.deadline}
            }`)

    });

task("escrowReject")
    .addParam("orderhash")
    .addParam("recipient")
    .addOptionalParam("recipientprivatekey")
    .setAction(async (taskArgs, hre) => {
        const escrow = await getContract(hre);

        const chainId = await (await hre.viem.getPublicClient()).getChainId();

        const types = {
            RejectTransferOrder: [
                {name: "orderHash", type: "bytes32"},
                {name: "deadline", type: "uint256"},
            ],
        };

        // Prepare the permit data
        const orderData = {
            orderHash: taskArgs.orderhash,
            deadline: Math.floor(Date.now() / 1000) + 3600 // 1 hour from now
        };


        const domain = {
            name: "IsinEscrow",
            version: "1",
            chainId: chainId,
            verifyingContract: getContractAddr(chainId, IsinEscrowProxyName),
        };

        // Sign the data using EIP-712
        const signer = taskArgs.recipientprivatekey ? new hre.ethers.Wallet(taskArgs.recipientprivatekey, hre.ethers.provider)
            : await hre.ethers.getSigner(taskArgs.recipient);
        const signature = await signer.signTypedData(domain, types, orderData);

        const r = signature.slice(0, 66) as `0x${string}`;
        const s = "0x" + signature.slice(66, 130) as `0x${string}`;
        const v = parseInt(signature.slice(130, 132), 16);

        try {
            const txnHash = await escrow.write.rejectTransferOrder([taskArgs.orderhash, BigInt(orderData.deadline), v, r, s]);
            await waitForTransactionReceipt(hre, txnHash);
            console.log(`Order ${taskArgs.orderhash} rejected by ${taskArgs.recipient}`)
        } catch (error: any) {
            await handleContractError(hre, error)
        }

        console.log(`{
            "hashLockId": "${orderData.orderHash}",
            "signedData": "${signature}",
            "deadline": ${orderData.deadline}
            }`)

    });


task("escrowAccept")
    .addParam("orderhash")
    .addParam("recipient")
    .addOptionalParam("recipientprivatekey")
    .setAction(async (taskArgs, hre) => {
        const escrow = await getContract(hre);

        const chainId = await (await hre.viem.getPublicClient()).getChainId();

        const types = {
            AcceptTransferOrder: [
                {name: "orderHash", type: "bytes32"},
                {name: "deadline", type: "uint256"},
            ],
        };

        // Prepare the permit data
        const orderData = {
            orderHash: taskArgs.orderhash,
            deadline: Math.floor(Date.now() / 1000) + 3600 // 1 hour from now
        };


        const domain = {
            name: "IsinEscrow",
            version: "1",
            chainId: chainId,
            verifyingContract: getContractAddr(chainId, IsinEscrowProxyName),
        };

        // Sign the data using EIP-712
        const signer = taskArgs.recipientprivatekey ? new hre.ethers.Wallet(taskArgs.recipientprivatekey, hre.ethers.provider)
            : await hre.ethers.getSigner(taskArgs.recipient);
        const signature = await signer.signTypedData(domain, types, orderData);

        const r = signature.slice(0, 66) as `0x${string}`;
        const s = "0x" + signature.slice(66, 130) as `0x${string}`;
        const v = parseInt(signature.slice(130, 132), 16);

        try {
            const txnHash = await escrow.write.acceptTransferOrder([taskArgs.orderhash, BigInt(orderData.deadline), v, r, s]);
            await waitForTransactionReceipt(hre, txnHash);
            console.log(`Order ${taskArgs.orderhash} accepted by ${taskArgs.recipient}`)
        } catch (error: any) {
            await handleContractError(hre, error)
        }

        console.log(`{
            "hashLockId": "${orderData.orderHash}",
            "signedData": "${signature}",
            "deadline": ${orderData.deadline}
            }`)

    });

