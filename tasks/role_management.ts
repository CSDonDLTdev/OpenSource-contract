import {task} from "hardhat/config";
import {getContractAddr, handleContractError, waitForTransactionReceipt} from "../scripts/utils";
import {HardhatRuntimeEnvironment} from "hardhat/types";
import {RoleManagerContractName, RoleManagerProxyName} from "../scripts/consts";

async function getContract(hre: HardhatRuntimeEnvironment) {
    const chainId = await (await hre.viem.getPublicClient()).getChainId();
    const roleManagerAddr = getContractAddr(chainId, RoleManagerProxyName)
    return await hre.viem.getContractAt(
        RoleManagerContractName,
        roleManagerAddr
    );
}

task("grantRole")
    .addParam("role", "role to grant")
    .addParam("account", "account to grant the role to")
    .setAction(async (taskArgs, hre) => {
        const roleManager = await getContract(hre);
        try {
        const txnHash = await roleManager.write.grantRole([hre.ethers.keccak256(hre.ethers.toUtf8Bytes(taskArgs.role)) as `0x${string}`, taskArgs.account]);
        await waitForTransactionReceipt(hre, txnHash);
        console.log("role granted");
        } catch (error: any) {
            await handleContractError(hre, error)
        }
    });

task("revokeRole")
    .addParam("role", "role to revoke")
    .addParam("account", "account to revoke the role from")
    .setAction(async (taskArgs, hre) => {
        const roleManager = await getContract(hre);
        try {
        const txnHash = await roleManager.write.revokeRole([hre.ethers.keccak256(hre.ethers.toUtf8Bytes(taskArgs.role)) as `0x${string}`, taskArgs.account]);
        await waitForTransactionReceipt(hre, txnHash);
        console.log("role revoked");
        } catch (error: any) {
            await handleContractError(hre, error)
        }
    });

task("hasRole")
    .addParam("role", "role to check")
    .addParam("account", "account to check for the role")
    .setAction(async (taskArgs, hre) => {
        const roleManager = await getContract(hre);
        const hasRole = await roleManager.read.hasRole([hre.ethers.keccak256(hre.ethers.toUtf8Bytes(taskArgs.role)) as `0x${string}`, taskArgs.account])
        console.log("has role", hasRole);
    });
