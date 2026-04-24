import {Contract} from "ethers";
import { readFileSync, writeFile,existsSync,mkdirSync } from "fs";
import {HardhatRuntimeEnvironment} from "hardhat/types";
import {DecodedError, ErrorDecoder} from "ethers-decode-error";
import {
    InvestorWhitelistContractName, IsinEscrowContractName,
    IsinPermitName,
    IsinWhitelistContractName,
    RoleManagerContractName
} from "./consts";

export async function addDeployment(chainId: number, name: string, contract: Contract, args?: {}) {
    const dir = `./deployments/chain-${chainId}`;
    if (!existsSync(dir)){
        mkdirSync(dir, { recursive: true });
    }

    return writeFile(
        `${dir}/${name}.json`,
        JSON.stringify({address: await contract.getAddress(), ...args}),
        "utf-8",
        ()=>{});
}

export function getContractAddr(chainId: number, name: string): `0x${string}` {
    const fileContent = readFileSync(`./deployments/chain-${chainId}/${name}.json`, 'utf8')
    return JSON.parse(fileContent)['address']
}

export function getContractInfo(chainId: number, name: string): {address:`0x${string}`, domainSeparator?:`0x${string}`} {
    const fileContent = readFileSync(`./deployments/chain-${chainId}/${name}.json`, 'utf8')
    return JSON.parse(fileContent)
}

function getInnermostCause(error: any): any {
    if (error && error.cause) {
        return getInnermostCause(error.cause);
    } else {
        return error;
    }
}

export async function handleContractError(hre: HardhatRuntimeEnvironment, error: any) {
    const isinWl = await hre.artifacts.readArtifact(IsinWhitelistContractName)
    const investorWl = await hre.artifacts.readArtifact(InvestorWhitelistContractName)
    const isinPermit = await hre.artifacts.readArtifact(IsinPermitName)
    const roleManager = await hre.artifacts.readArtifact(RoleManagerContractName)
    const isinEscrow = await hre.artifacts.readArtifact(IsinEscrowContractName)
    const errorDecoder = ErrorDecoder.create([isinWl.abi, investorWl.abi, isinPermit.abi, roleManager.abi, isinEscrow.abi])
    const decodedError: DecodedError = await errorDecoder.decode(getInnermostCause(error))
    console.error("\n\nERROR: transaction reverted")
    if (decodedError.reason) {
        console.error(`Revert reason: ${decodedError.reason}(${decodedError.args})`)
    } else {
        console.error(`Error: ${error}`)
        console.error(`Caused by: ${getInnermostCause(error)}`)
    }
}

export async function waitForTransactionReceipt(hre: HardhatRuntimeEnvironment, txnHash: `0x${string}`) {
    const receipt = await (await hre.viem.getPublicClient()).waitForTransactionReceipt({hash: txnHash});
    if (receipt.status !== "success") {
        console.error(receipt);
        throw Error ("Transaction failed");
    }
}