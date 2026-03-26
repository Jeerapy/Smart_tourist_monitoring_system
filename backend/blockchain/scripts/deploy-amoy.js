const hre = require("hardhat");

async function main() {
  const registry = await hre.ethers.deployContract("DocumentRegistry");
  await registry.waitForDeployment();
  const address = await registry.getAddress();

  console.log("DocumentRegistry deployed:", address);
  console.log(
    "Copy ABI from artifacts/contracts/DocumentRegistry.sol/DocumentRegistry.json",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

