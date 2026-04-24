import {task} from "hardhat/config";
import {getContractAddr, handleContractError, waitForTransactionReceipt} from "../scripts/utils";
import {HardhatRuntimeEnvironment} from "hardhat/types";
import {IsinWhitelistContractName, IsinWhitelistProxyName} from "../scripts/consts";

async function getContract(hre: HardhatRuntimeEnvironment) {
    const chainId = await (await hre.viem.getPublicClient()).getChainId();
    const whiteListAddr = getContractAddr(chainId, IsinWhitelistProxyName)
    return await hre.viem.getContractAt(
        IsinWhitelistContractName,
        whiteListAddr
    );
}

task("addIsin")
    .addParam("isin")
    .addParam("isintype")
    .addParam("name")
    .addParam("shortname")
    .addParam("issuername")
    .addParam("issuercode")
    .addParam("cfi")
    .setAction(async (taskArgs, hre) => {
        const whiteList = await getContract(hre);
        try {
            const txnHash = await whiteList.write.addIsin([taskArgs.isin, taskArgs.isintype, taskArgs.name, taskArgs.shortname, taskArgs.issuername, taskArgs.issuercode, taskArgs.cfi]);
            await waitForTransactionReceipt(hre, txnHash);
            console.log("isin created")
        } catch (error: any) {
            await handleContractError(hre, error)
        }
    });

task("modifyIsinAttributes")
    .addParam("isin")
    .addParam("isintype")
    .addParam("name")
    .addParam("shortname")
    .addParam("issuername")
    .addParam("issuercode")
    .addParam("cfi")
    .setAction(async (taskArgs, hre) => {
        const whiteList = await getContract(hre);
        try {
            const txnHash = await whiteList.write.modifyIsinAttributes([taskArgs.isin, taskArgs.isintype, taskArgs.name, taskArgs.shortname, taskArgs.issuername, taskArgs.issuercode, taskArgs.cfi]);
            await waitForTransactionReceipt(hre, txnHash);
            console.log("isin modified");
        } catch (error: any) {
            await handleContractError(hre, error)
        }
    });

task("removeIsin")
    .addParam("isin")
    .setAction(async (taskArgs, hre) => {
        const whiteList = await getContract(hre);
        try {
            const txnHash = await whiteList.write.removeIsin([taskArgs.isin]);
            await waitForTransactionReceipt(hre, txnHash);
            console.log("isin removed")
        } catch (error: any) {
            await handleContractError(hre, error)
        }
    });

task("blockIsin")
    .addParam("isin")
    .setAction(async (taskArgs, hre) => {
        const whiteList = await getContract(hre);
        try {
            const txnHash = await whiteList.write.blockIsin([taskArgs.isin]);
            await waitForTransactionReceipt(hre, txnHash);
            console.log("isin blocked")
        } catch (error: any) {
            await handleContractError(hre, error)
        }
    });

task("unblockIsin")
    .addParam("isin")
    .setAction(async (taskArgs, hre) => {
        const whiteList = await getContract(hre);
        try {
            const txnHash = await whiteList.write.unblockIsin([taskArgs.isin]);
            await waitForTransactionReceipt(hre, txnHash);
            console.log("isin unlbocked")
        } catch (error: any) {
            await handleContractError(hre, error)
        }
    });

task("listIsins")
    .setAction(async (taskArgs, hre) => {
        const whiteList = await getContract(hre);
        const contracts = await whiteList.read.listIsins();
        console.log("isins", contracts)
    });

task("seedIsins")
    .setAction(async (taskArgs, hre) => {
        await hre.run("addIsin", {
            isin: "PLPKN0000018",
            isintype: "ES",
            name: "ORLEN SPÓŁKA AKCYJNA",
            shortname: "PKN",
            issuername: "ORLEN SPÓŁKA AKCYJNA",
            issuercode: "PKN",
            cfi: "ESVUFB"
        });
        await hre.run("addIsin", {
            isin: "PLOPTTC00011",
            isintype: "ES",
            name: "CD PROJEKT S.A.",
            shortname: "CDR",
            issuername: "CD PROJEKT S.A.",
            issuercode: "CDR",
            cfi: "ESVUFB"
        });
        await hre.run("addIsin", {
            isin: "US02079K1079",
            isintype: "ES",
            name: "Google LCC",
            shortname: "Google",
            issuername: "Google LCC",
            issuercode: "Google",
            cfi: "ESVUFB"
        });
        await hre.run("addIsin", {
            isin: "PL0000115192",
            isintype: "DB",
            name: "Obligacje Skarbowe",
            shortname: "PS0728",
            issuername: "Skarb Państwa",
            issuercode: "Skarb Państwa",
            cfi: "DBFTGB"
        });
    });
