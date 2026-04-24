import {task} from "hardhat/config";
import {getContractAddr, handleContractError, waitForTransactionReceipt} from "../scripts/utils";
import {HardhatRuntimeEnvironment} from "hardhat/types";
import {InvestorWhitelistContractName, InvestorWhitelistProxyName} from "../scripts/consts";

async function getContract(hre: HardhatRuntimeEnvironment) {
    const chainId = await (await hre.viem.getPublicClient()).getChainId();
    const whiteListAddr = getContractAddr(chainId, InvestorWhitelistProxyName)
    return await hre.viem.getContractAt(
        InvestorWhitelistContractName,
        whiteListAddr
    );
}

task("addInvestor")
    .addParam("wallet")
    .addParam("investortype")
    .setAction(async (taskArgs, hre) => {
        const whiteList = await getContract(hre);
        try {
            const txnHash = await whiteList.write.addInvestor([taskArgs.wallet, taskArgs.investortype]);
            await waitForTransactionReceipt(hre, txnHash);
            console.log("investor created")
        } catch (error: any) {
            await handleContractError(hre, error)
        }
    });

task("modifyInvestorAttributes")
    .addParam("wallet")
    .addParam("investortype")
    .setAction(async (taskArgs, hre) => {
        const whiteList = await getContract(hre);
        try {
            const txnHash = await whiteList.write.modifyInvestorAttributes([taskArgs.wallet, taskArgs.investortype]);
            await waitForTransactionReceipt(hre, txnHash);
            console.log("investor modified");
        } catch (error: any) {
            await handleContractError(hre, error)
        }
    });

task("removeInvestor")
    .addParam("wallet")
    .setAction(async (taskArgs, hre) => {
        const whiteList = await getContract(hre);
        try {
            const txnHash = await whiteList.write.removeInvestor([taskArgs.wallet]);
            await waitForTransactionReceipt(hre, txnHash);
            console.log("investor removed")
        } catch (error: any) {
            await handleContractError(hre, error)
        }
    });

task("blockInvestor")
    .addParam("wallet")
    .setAction(async (taskArgs, hre) => {
        const whiteList = await getContract(hre);
        try {
            const txnHash = await whiteList.write.blockInvestor([taskArgs.wallet]);
            await waitForTransactionReceipt(hre, txnHash);
            console.log("investor blocked")
        } catch (error: any) {
            await handleContractError(hre, error)
        }
    });

task("unblockInvestor")
    .addParam("wallet")
    .setAction(async (taskArgs, hre) => {
        const whiteList = await getContract(hre);
        try {
            const txnHash = await whiteList.write.unblockInvestor([taskArgs.wallet]);
            await waitForTransactionReceipt(hre, txnHash);
            console.log("investor unlbocked")
        } catch (error: any) {
            await handleContractError(hre, error)
        }
    });

task("addAllowedIsinType")
    .addParam("wallet")
    .addParam("isintype")
    .setAction(async (taskArgs, hre) => {
        const whiteList = await getContract(hre);
        try {
            const txnHash = await whiteList.write.addAllowedIsinType([taskArgs.wallet, taskArgs.isintype]);
            await waitForTransactionReceipt(hre, txnHash);
            console.log("allowed isin type added")
        } catch (error: any) {
            await handleContractError(hre, error)
        }
    });

task("removeAllowedIsinType")
    .addParam("wallet")
    .addParam("isintype")
    .setAction(async (taskArgs, hre) => {
        const whiteList = await getContract(hre);
        try {
            const txnHash = await whiteList.write.removeAllowedIsinType([taskArgs.wallet, taskArgs.isintype]);
            await waitForTransactionReceipt(hre, txnHash);
            console.log("allowed isin type removed");
        } catch (error: any) {
            await handleContractError(hre, error)
        }
    });

task("listInvestors")
    .setAction(async (taskArgs, hre) => {
        const whiteList = await getContract(hre);
        const contracts = await whiteList.read.listInvestors();
        console.log("investors", contracts)
    });


task("seedInvestors")
    .setAction(async (taskArgs, hre) => {
        await hre.run("addInvestor", {wallet: "0xf22072224E1c58229802a9D7b4E5a7ba024E4650", investortype: "kamila"});
        await hre.run("addInvestor", {wallet: "0x06D45E16FC20767A324e72949A767F5eb346B87a", investortype: "grzesiek"});
        await hre.run("addInvestor", {wallet: "0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199", investortype: "rafal"});
        await hre.run("addInvestor", {wallet: "0x1BeE699E58d8FFa0B130ff517217Fbad879b799a", investortype: "michal"});
        await hre.run("addInvestor", {wallet: "0xfe3b557e8fb62b89f4916b721be55ceb828dbd73", investortype: "test1"});
        await hre.run("addInvestor", {wallet: "0x627306090abaB3A6e1400e9345bC60c78a8BEf57", investortype: "test2"});

        await hre.run("seedAllowedInvestorsIsins", {});
    });

task("seedAllowedInvestorsIsins")
    .setAction(async (taskArgs, hre) => {
        await hre.run("addAllowedIsinType", { wallet: "0xf22072224E1c58229802a9D7b4E5a7ba024E4650", isintype: "ES" });
        await hre.run("addAllowedIsinType", { wallet: "0xf22072224E1c58229802a9D7b4E5a7ba024E4650", isintype: "DB" });
        await hre.run("addAllowedIsinType", { wallet: "0x06D45E16FC20767A324e72949A767F5eb346B87a", isintype: "ES" });
        await hre.run("addAllowedIsinType", { wallet: "0x06D45E16FC20767A324e72949A767F5eb346B87a", isintype: "DB" });
        await hre.run("addAllowedIsinType", { wallet: "0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199", isintype: "ES" });
        await hre.run("addAllowedIsinType", { wallet: "0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199", isintype: "DB" });
        await hre.run("addAllowedIsinType", { wallet: "0x1BeE699E58d8FFa0B130ff517217Fbad879b799a", isintype: "ES" });
        await hre.run("addAllowedIsinType", { wallet: "0x1BeE699E58d8FFa0B130ff517217Fbad879b799a", isintype: "DB" });
        await hre.run("addAllowedIsinType", { wallet: "0xfe3b557e8fb62b89f4916b721be55ceb828dbd73", isintype: "ES" });
        await hre.run("addAllowedIsinType", { wallet: "0x627306090abaB3A6e1400e9345bC60c78a8BEf57", isintype: "DB" });
    });