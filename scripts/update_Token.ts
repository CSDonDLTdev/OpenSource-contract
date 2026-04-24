import {getContractAddr} from "./utils";
import {IsinPermitName, TokenBeaconName} from "./consts";
import {ethers, upgrades, network} from "hardhat";

async function main() {
    const chainId = Number(await network.provider.request({
        method: "eth_chainId",
    }));
    const beaconAddr = getContractAddr(chainId, TokenBeaconName)
    const IsinPermit = await ethers.getContractFactory(IsinPermitName);
    await upgrades.upgradeBeacon(beaconAddr, IsinPermit);
    console.log("Beacon upgraded");

}

main();