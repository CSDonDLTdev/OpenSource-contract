import {getContractAddr} from "./utils";
import {RoleManagerProxyName} from "./consts";

const { ethers, upgrades, network } = require("hardhat");

async function main() {
    const chainId = Number(await network.provider.request({
        method: "eth_chainId",
    }));
    const roleManagerAddr = getContractAddr(chainId, RoleManagerProxyName)
    const RoleManager = await ethers.getContractFactory("RoleManagerV2");
    await upgrades.upgradeProxy(roleManagerAddr, RoleManager);
    console.log("RoleManager upgraded");

}

main();