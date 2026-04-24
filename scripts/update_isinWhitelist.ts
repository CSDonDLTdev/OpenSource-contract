import {getContractAddr} from "./utils";
import {IsinWhitelistContractName, IsinWhitelistProxyName} from "./consts";
import {ethers, upgrades, network} from "hardhat";

async function main() {
    const chainId = Number(await network.provider.request({
        method: "eth_chainId",
    }));
    const whitelistAddr = getContractAddr(chainId, IsinWhitelistProxyName)
    const ISINWhiteList = await ethers.getContractFactory(IsinWhitelistContractName);
    await upgrades.upgradeProxy(whitelistAddr, ISINWhiteList);
    console.log("ISIN whitelist upgraded");

}

main();