import {addDeployment} from "./utils";
import {
    InvestorWhitelistContractName,
    InvestorWhitelistProxyName,
    IsinEscrowContractName,
    IsinEscrowProxyName,
    IsinPermitName,
    IsinWhitelistContractName,
    IsinWhitelistProxyName,
    RoleManagerContractName,
    RoleManagerProxyName,
    TokenBeaconName
} from "./consts";
import {viem} from "hardhat";

const {ethers, upgrades, network} = require("hardhat");

async function main() {
    const chainId = Number(await network.provider.request({
        method: "eth_chainId",
    }));

    const RoleManager = await ethers.getContractFactory(RoleManagerContractName);
    const roleManager = await upgrades.deployProxy(RoleManager);
    await roleManager.waitForDeployment();
    console.log("Role Manager proxy deployed to:", await roleManager.getAddress());
    await addDeployment(chainId, RoleManagerProxyName, roleManager);

    const InvestorWhiteList = await ethers.getContractFactory(InvestorWhitelistContractName);
    const investorWhitelist = await upgrades.deployProxy(InvestorWhiteList, [await roleManager.getAddress()]);
    await investorWhitelist.waitForDeployment();
    console.log('Investor white List proxy deployed to:', await investorWhitelist.getAddress());
    await addDeployment(chainId, InvestorWhitelistProxyName, investorWhitelist)

    const IsinPermit = await ethers.getContractFactory(IsinPermitName);
    const beacon = await upgrades.deployBeacon(IsinPermit);
    await beacon.waitForDeployment();
    await addDeployment(chainId, TokenBeaconName, beacon)
    console.log("Isin Beacon deployed to:", await beacon.getAddress());

    const ISINWhiteList = await ethers.getContractFactory(IsinWhitelistContractName);
    const isinWhitelist = await upgrades.deployProxy(ISINWhiteList, [await roleManager.getAddress(), await beacon.getAddress(), await investorWhitelist.getAddress()]);
    await isinWhitelist.waitForDeployment();
    console.log("Isin white List proxy deployed to:", await isinWhitelist.getAddress());
    await addDeployment(chainId, IsinWhitelistProxyName, isinWhitelist)

    const IsinEscrowFactory = await ethers.getContractFactory(IsinEscrowContractName);
    const isinEscrow = await upgrades.deployProxy(IsinEscrowFactory);
    await isinEscrow.waitForDeployment();
    console.log("Isin escrow proxy deployed to:", await isinEscrow.getAddress());
    await addDeployment(chainId, IsinEscrowProxyName, isinEscrow)

}

main();