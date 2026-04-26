import {task} from "hardhat/config";
import {getContractAddr, handleContractError, waitForTransactionReceipt} from "../scripts/utils";
import {HardhatRuntimeEnvironment} from "hardhat/types";
import {IsinPermitName, IsinWhitelistContractName, IsinWhitelistProxyName} from "../scripts/consts";

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

task("mint")
    .addParam("isin")
    .addParam("account", "address where tokens will be stored")
    .addParam("amount", "number of tokens to mint")
    .setAction(async (taskArgs, hre) => {
        const [, , , mintManagerSigner] = await hre.viem.getWalletClients(); //fourth signer (PK_ISIN_MINT_BURN_MANAGER)
        const isin = await getIsin(hre, taskArgs.isin);
        if (!isin) {
            console.error(`Isin not found: ${taskArgs.isin}`)
            return;
        }

        const token = await hre.viem.getContractAt(
            IsinPermitName,
            isin.addr
        );
        try {
            const txnHash = await token.write.mint([taskArgs.account, taskArgs.amount], {account: mintManagerSigner.account});
            await waitForTransactionReceipt(hre, txnHash);
            console.log(`Token ${isin.isin}:${isin.addr} minted: ${taskArgs.amount} to: ${taskArgs.account}`)
        } catch (error: any) {
            await handleContractError(hre, error)
        }
    });

task("burn")
    .addParam("isin")
    .addParam("account", "address where tokens will be burnt")
    .addParam("amount", "number of tokens to burn")
    .setAction(async (taskArgs, hre) => {
        const [, , , burnManagerSigner] = await hre.viem.getWalletClients(); //fourth signer (PK_ISIN_MINT_BURN_MANAGER)
        const isin = await getIsin(hre, taskArgs.isin);
        if (!isin) {
            console.error(`Isin not found: ${taskArgs.isin}`)
            return;
        }
        const token = await hre.viem.getContractAt(
            IsinPermitName,
            isin.addr
        );
        try {
            const txnHash = await token.write.burn([taskArgs.account, taskArgs.amount], {account: burnManagerSigner.account});
            await waitForTransactionReceipt(hre, txnHash);
            console.log(`Token ${isin.isin}:${isin.addr} owner: ${await token.read.owner()}, burnt: ${taskArgs.amount}`)
        } catch (error: any) {
            await handleContractError(hre, error)
        }
    });

task("balance")
    .addParam("isin")
    .addParam("account")
    .setAction(async (taskArgs, hre) => {
        const isin = await getIsin(hre, taskArgs.isin);
        if (!isin) {
            console.error(`Isin not found: ${taskArgs.isin}`)
            return;
        }
        const token = await hre.viem.getContractAt(
            IsinPermitName,
            isin.addr
        );
        const balance = await token.read.balanceOf([taskArgs.account]);
        console.log(`Token ${isin.isin}:${isin.addr}. Account ${taskArgs.account} balance: ${balance}`)
    });

task("totalSupply")
    .addParam("isin")
    .setAction(async (taskArgs, hre) => {
        const isin = await getIsin(hre, taskArgs.isin);
        if (!isin) {
            console.error(`Isin not found: ${taskArgs.isin}`)
            return;
        }
        const token = await hre.viem.getContractAt(
            IsinPermitName,
            isin.addr
        );
        const totalSupply = await token.read.totalSupply();
        console.log(`Token ${isin.isin}:${isin.addr} totalSupply: ${totalSupply}`)
    });

task("transfer")
    .addParam("isin")
    .addParam("from")
    .addOptionalParam("fromprivatekey")
    .addParam("to")
    .addParam("amount")
    .addOptionalParam("customvalue")
    .setAction(async (taskArgs, hre) => {
        const isin = await getIsin(hre, taskArgs.isin);
        if (!isin) {
            console.error(`Isin not found: ${taskArgs.isin}`)
            return;
        }

        const token = await hre.viem.getContractAt(
            IsinPermitName,
            isin.addr
        );

        const domain = {
            name: isin.isin,
            version: "1",
            chainId: await (await hre.viem.getPublicClient()).getChainId(),
            verifyingContract: isin.addr,
        };

        const types = {
            Transfer: [
                {name: "owner", type: "address"},
                {name: "to", type: "address"},
                {name: "value", type: "uint256"},
                {name: "customvalue", type: "uint256"},
                {name: "nonce", type: "uint256"},
                {name: "deadline", type: "uint256"},
            ],
        };

        // Prepare the permit data
        const permitData = {
            owner: taskArgs.from,
            to: taskArgs.to,
            value: taskArgs.amount,
            customvalue: taskArgs.customvalue || 0,
            nonce: await token.read.nonces([taskArgs.from]),
            deadline: Math.floor(Date.now() / 1000) + 3600 // 1 hour from now
        };

        // Sign the data using EIP-712
        const signer = taskArgs.fromprivatekey ? new hre.ethers.Wallet(taskArgs.fromprivatekey, hre.ethers.provider)
             : await hre.ethers.getSigner(taskArgs.from);
        const signature = await signer.signTypedData(domain, types, permitData);

        // Extract r, s, v from the signature
        const r = signature.slice(0, 66) as `0x${string}`;
        const s = "0x" + signature.slice(66, 130) as `0x${string}`;
        const v = parseInt(signature.slice(130, 132), 16);

        try {
            const txnHash = await token.write.transferPermit([taskArgs.from, taskArgs.to, taskArgs.amount, taskArgs.customvalue || 0, BigInt(permitData.deadline), v, r, s]);
            await waitForTransactionReceipt(hre, txnHash);
            console.log(`Transferred ${taskArgs.amount} ${isin.isin} from: ${taskArgs.from} to: ${taskArgs.to}. custom value: ${taskArgs.customvalue}`)
        } catch (error: any) {
            await handleContractError(hre, error)
        }
    });

task("get_nonce")
    .addParam("isin")
    .addParam("from")
    .setAction(async (taskArgs, hre) => {
        const isin = await getIsin(hre, taskArgs.isin);
        if (!isin) {
            console.error(`Isin not found: ${taskArgs.isin}`)
            return;
        }

        const token = await hre.viem.getContractAt(
            IsinPermitName,
            isin.addr
        );
        const nonce = await token.read.nonces([taskArgs.from]);
        console.log(`Nonce for contract ${isin.isin} account ${taskArgs.from}: ${nonce}.`)
    });

task("sign")
    .addParam("isin")
    .addParam("isinaddr")
    .addParam("from")
    .addParam("privatekey")
    .addParam("to")
    .addParam("amount")
    .addOptionalParam("customvalue")
    .addParam("nonce")
    .setAction(async (taskArgs, hre) => {

        const domain = {
            name: taskArgs.isin,
            version: "1",
            chainId: await (await hre.viem.getPublicClient()).getChainId(),
            verifyingContract: taskArgs.isinaddr,
        };

        const types = {
            Transfer: [
                {name: "owner", type: "address"},
                {name: "to", type: "address"},
                {name: "value", type: "uint256"},
                {name: "customvalue", type: "uint256"},
                {name: "nonce", type: "uint256"},
                {name: "deadline", type: "uint256"},
            ],
        };

        // Prepare the permit data
        const permitData = {
            owner: taskArgs.from,
            to: taskArgs.to,
            value: taskArgs.amount,
            customvalue: taskArgs.customvalue || 0,
            nonce: taskArgs.nonce,
            deadline: Math.floor(Date.now() / 1000) + 3600 // 1 hour from now
        };

        // Sign the data using EIP-712
        const signer = new hre.ethers.Wallet(taskArgs.privatekey, hre.ethers.provider);
        const signature = await signer.signTypedData(domain, types, permitData);

            console.log(`{
            "signedData": "${signature}",
            "contractAddr": "",
            "to": "${taskArgs.to}",
            "value": ${taskArgs.amount},
            "customValue": ${permitData.customvalue},
            "deadline": ${permitData.deadline}
            }`)

    });

task("transfer_signed")
    .addParam("isin")
    .addParam("from")
    .addParam("to")
    .addParam("amount")
    .addOptionalParam("customvalue")
    .addParam("signature")
    .addParam("deadline")
    .setAction(async (taskArgs, hre) => {
        const isin = await getIsin(hre, taskArgs.isin);
        if (!isin) {
            console.error(`Isin not found: ${taskArgs.isin}`)
            return;
        }

        const token = await hre.viem.getContractAt(
            IsinPermitName,
            isin.addr
        );
        const signature = taskArgs.signature;
        // Extract r, s, v from the signature
        const r = signature.slice(0, 66) as `0x${string}`;
        const s = "0x" + signature.slice(66, 130) as `0x${string}`;
        const v = parseInt(signature.slice(130, 132), 16);

        try {
            const txnHash = await token.write.transferPermit([taskArgs.from, taskArgs.to, taskArgs.amount, taskArgs.customvalue || 0, taskArgs.deadline, v, r, s]);
            await waitForTransactionReceipt(hre, txnHash);
            console.log(`Transferred ${taskArgs.amount} ${isin.isin} from: ${taskArgs.from} to: ${taskArgs.to}. custom value: ${taskArgs.customvalue}`)
        } catch (error: any) {
            await handleContractError(hre, error)
        }
    });

task("mintIsinsToTestInvestors")
    .setAction(async (taskArgs, hre) => {
        await hre.run("mint", { isin: "PLPKN0000018", account: "0xf22072224E1c58229802a9D7b4E5a7ba024E4650", amount: "100" });
        await hre.run("mint", { isin: "PLOPTTC00011", account: "0xf22072224E1c58229802a9D7b4E5a7ba024E4650", amount: "200" });
        await hre.run("mint", { isin: "US02079K1079", account: "0xf22072224E1c58229802a9D7b4E5a7ba024E4650", amount: "300" });
        await hre.run("mint", { isin: "PL0000115192", account: "0xf22072224E1c58229802a9D7b4E5a7ba024E4650", amount: "400" });

        await hre.run("mint", { isin: "PLPKN0000018", account: "0x06D45E16FC20767A324e72949A767F5eb346B87a", amount: "1100" });
        await hre.run("mint", { isin: "PLOPTTC00011", account: "0x06D45E16FC20767A324e72949A767F5eb346B87a", amount: "20" });
        await hre.run("mint", { isin: "PL0000115192", account: "0x06D45E16FC20767A324e72949A767F5eb346B87a", amount: "40" });

        await hre.run("mint", { isin: "PLPKN0000018", account: "0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199", amount: "110" });
        await hre.run("mint", { isin: "PLOPTTC00011", account: "0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199", amount: "220" });
        await hre.run("mint", { isin: "US02079K1079", account: "0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199", amount: "330" });
        await hre.run("mint", { isin: "PL0000115192", account: "0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199", amount: "440" });

        await hre.run("mint", { isin: "PLPKN0000018", account: "0x1BeE699E58d8FFa0B130ff517217Fbad879b799a", amount: "120" });
        await hre.run("mint", { isin: "PLOPTTC00011", account: "0x1BeE699E58d8FFa0B130ff517217Fbad879b799a", amount: "230" });
        await hre.run("mint", { isin: "US02079K1079", account: "0x1BeE699E58d8FFa0B130ff517217Fbad879b799a", amount: "340" });
        await hre.run("mint", { isin: "PL0000115192", account: "0x1BeE699E58d8FFa0B130ff517217Fbad879b799a", amount: "450" });

        await hre.run("mint", { isin: "PLPKN0000018", account: "0xfe3b557e8fb62b89f4916b721be55ceb828dbd73", amount: "110" });
    });