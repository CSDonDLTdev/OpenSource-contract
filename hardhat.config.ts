import {HardhatUserConfig} from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-viem";
import "@openzeppelin/hardhat-upgrades";

import "./tasks/role_management"
import "./tasks/isinwl"
import "./tasks/investorwl"
import "./tasks/isinpermit"
import "./tasks/isinescrow"
require("dotenv").config();

const TEST_PRIV_KEY = process.env.PRIVATE_KEY!;
const token = process.env.BESU_TOKEN!;

const config: HardhatUserConfig = {
  solidity: "0.8.24",
  networks: {
    localhost: {
      chainId: 1337,
      url: "http://localhost:18545",
      accounts: [TEST_PRIV_KEY],
      gasPrice: 0,
    },
    hardhat: {
      chainId: 1337,
      initialBaseFeePerGas: 0,
      gasPrice: 0,
    },
    besu_azure: {
      chainId: 1337,
      url: "http://kdpw-poc.polandcentral.cloudapp.azure.com:8545",
      httpHeaders: {
        "Authorization": "Bearer " + token,
      },
      gasPrice: 0,
      accounts: [TEST_PRIV_KEY],
    },
    besu_azure_sign: {
      chainId: 1337,
      url: "http://kdpw-poc.polandcentral.cloudapp.azure.com:28545",
      gasPrice: 0
    },
  },
};

export default config;
