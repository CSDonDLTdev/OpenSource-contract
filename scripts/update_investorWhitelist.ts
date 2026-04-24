import {getContractAddr} from "./utils";
import {
    InvestorWhitelistContractName,
    InvestorWhitelistProxyName
} from "./consts";
import {ethers, upgrades, network} from "hardhat";

async function main() {
    const chainId = Number(await network.provider.request({
        method: "eth_chainId",
    }));
    const whitelistAddr = getContractAddr(chainId, InvestorWhitelistProxyName)
    const InvestorWhiteList = await ethers.getContractFactory(InvestorWhitelistContractName);
    await upgrades.upgradeProxy(whitelistAddr, InvestorWhiteList);
    console.log("Investor whitelist upgraded");

}

main();