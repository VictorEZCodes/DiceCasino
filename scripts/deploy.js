const hre = require("hardhat");
const ethers = hre.ethers;

async function main() {
  const houseEdge = 200; 
  const minBet = ethers.parseEther("0.01");
  const maxBet = ethers.parseEther("1");
  const maxProfitPercent = 50;

  const DiceCasino = await ethers.getContractFactory("contracts/DiceCasinoV1.sol:DiceCasino");
  const casino = await DiceCasino.deploy(
    houseEdge,
    minBet,
    maxBet,
    maxProfitPercent
  );

  await casino.waitForDeployment();
  console.log("DiceCasino V1 deployed to:", await casino.getAddress());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });