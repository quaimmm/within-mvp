import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const broadcastPath = resolve(root, "contracts/broadcast/DeployWithin.s.sol/5042002/run-latest.json");
const artifactPath = resolve(root, "deployments/arc-testnet.json");
const broadcast = JSON.parse(readFileSync(broadcastPath, "utf8"));
const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));

if (broadcast.chain !== 5042002 && broadcast.chain !== "5042002") throw new Error("Broadcast artifact is not Arc Testnet.");

const names = ["WithinPolicyExecutor", "WithinMultisigExecutor", "WithinCreditFacility"];
for (const name of names) {
  const deployment = broadcast.transactions.find((item) => item.transactionType === "CREATE" && item.contractName === name);
  if (!deployment?.contractAddress || !deployment?.hash) throw new Error(`Missing confirmed ${name} deployment in Foundry broadcast output.`);
  artifact.contracts[name] = { address: deployment.contractAddress, deploymentTx: deployment.hash, verified: false };
}
artifact.deployer = broadcast.transactions.find((item) => item.transactionType === "CREATE")?.transaction?.from || "";
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(`Updated ${artifactPath} from Foundry's broadcast artifact.`);
