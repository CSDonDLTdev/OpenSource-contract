# Smart Contracts Project

## Overview

This project manages smart contracts for ISIN and Investor whitelists, roles, transfers and escrow functionality. It is built using **Solidity** and **Hardhat** to deploy and test contracts on a **Hyperledger Besu** network. 

## Project Structure

```
.
├── contracts/
│   ├── ISINWhiteList.sol          # ISIN whitelist management
│   ├── InvestorWhiteList.sol      # Investor whitelist management
│   ├── IsinEscrow.sol             # Escrow functionality
│   ├── IsinPermit.sol             # Permit-based operations for ISINs
│   └── RoleManager.sol            # Role-based access control
├── scripts/                       # Scripts for contract deployment/upgrade
├── tasks/                         # Hardhat tasks for calling smart contract functions
├── test/                          # Unit tests for contracts
├── get_besu_token.sh              # Script to fetch Besu token - required for running scripts on the RPC endpoint in Azure
├── hardhat.config.ts              # Hardhat configuration - besu_azure.url should point to Azure public IP DNS
├── package.json                   # NPM dependencies and scripts
└── deployments/                   # Smart contract addresses to be referenced by hardhat scripts
```

## Prerequisites

- **Node.js** (v16+)

## Setup

### Build the project

   ```bash
    npm install --save-dev hardhat
    npm run build
    #optionally npm run test
   ```
### Create a `.env` file

   ```
    PRIVATE_KEY=
    BESU_USERNAME=
    BESU_PASSWORD=
   ```
`PRIVATE_KEY` is the private key of the account used for calling hardhat scripts.
For assigning roles this has to be the owner of the contracts (the account used for deployment).
For modifying the ISIN/Investor whitelist, mint or burn this needs to be an account with proper roles assigned.

`BESU_USERNAME, BESU_PASSWORD` credentials for the public Besu RPC endpoint when accessing the Azure environment - refer to
[besu-poc/README.md](https://dev.azure.com/7bulls/KDPW-BLC/_git/besu-poc?path=/README.md) Changing the password section.

### Configure `hardhat.config.ts` with your RPC URL

If Besu is deployed with non-default Azure template parameters, the RPC url needs ot be updated in `hardhat.config.ts`
   ```
    besu_azure: {
      url: "http://kdpw-poc.polandcentral.cloudapp.azure.com:8545",
   ```
---

### Copy smart contract deployment output form the Azure vm
In order to call smart contract functions, we need the contract addresses that are stored in `/deployments` on deployment.

   ```bash
    scp -r kdpw-vmadmin@kdpw-poc.polandcentral.cloudapp.azure.com:/home/kdpw-vmadmin/contract-poc/deployments/chain-1337 ./deployments
   ```
The password needs to match the `adminPassword` template parameter of the infrastructure deployment [infra-poc/README.md](https://dev.azure.com/7bulls/KDPW-BLC/_git/infra-poc?path=/README.md)

## Usage

The `package.json` includes useful scripts for deployment and operations. The management api scripts include:

### Role management
Only the contract owner can access the modifying operations.

- **ISIN_WL_MANAGER**:
   ```
   grantIsinManagerRole_azure    # grants the role to the specified acount
   revokeIsinManagerRole_azure   # revokes the role from the specified acount
   hasIsinManagerRole_azure      # verifies the role assignment on the specified acount
   ```

- **INVESTOR_WL_MANAGER**:
   ```
   grantInvestorManagerRole_azure    # grants the role to the specified acount
   revokeInvestorManagerRole_azure   # revokes the role from the specified acount
   hasInvestorManagerRole_azure      # verifies the role assignment on the specified acount
   ```

- **ISIN_MINT_BURN_MANAGER**:
   ```
   grantMintBurnManagerRole_azure    # grants the role to the specified acount
   revokeMintBurnManagerRole_azure   # revokes the role from the specified acount
   hasMintBurnManagerRole_azure      # verifies the role assignment on the specified acount
   ```

### ISIN whitelist management
Only an account with ISIN_WL_MANAGER role assigned can access the modifying operations.

   ```
   listIsins_azure
   addIsin_azure
   modifyIsinAttributes_azure
   removeIsin_azure
   blockIsin_azure
   unblockIsin_azure
   ```

### Investor whitelist management
Only an account with INVESTOR_WL_MANAGER role assigned can access the modifying operations.

   ```
   listInvestors_azure
   addInvestor_azure
   modifyInvestorAttributes_azure
   removeInvestor_azure
   blockInvestor_azure
   unblockInvestor_azure
   addAllowedIsinType_azure
   removeAllowedIsinType_azure
   ```

### ISIN mint/burn
Only an account with ISIN_MINT_BURN_MANAGER role assigned can access the modifying operations.

   ```
   mint_azure            # mint tokens related to the specified ISIN to the specified account
   burn_azure            # burn tokens related to the specified ISIN from the specified account
   balance_azure         # check balance of the specified ISIN on the specified account
   totalSupply_azure     # check the total number of tokens of the specified ISIN 
   ```

## Local deployment

There is an option to deploy and test the smart contracts locally.

   ```bash
    npm run start_local     #start hardhat locally
    npm run deploy_local    #deploy smart contracts 

    #run the scripts *_local (referencing --network localhost)
   ```