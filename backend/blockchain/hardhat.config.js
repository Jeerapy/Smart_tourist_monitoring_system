require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const amoyRpc = process.env.AMOY_RPC_URL || "";
const privateKey = process.env.DEPLOYER_PRIVATE_KEY || "";
const scanKey = process.env.POLYGONSCAN_API_KEY || "";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.24",
  networks: {
    amoy: {
      url: amoyRpc,
      chainId: 80002,
      accounts: privateKey ? [privateKey] : [],
    },
  },
  etherscan: {
    apiKey: {
      polygonAmoy: scanKey,
    },
  },
};

