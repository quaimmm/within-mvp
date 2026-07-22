import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const contractsDir = resolve(root, "contracts");
const artifactPath = resolve(root, "deployments/arc-testnet.json");
const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
if (artifact.chainId !== 5042002) throw new Error("Deployment artifact is not Arc Testnet.");

const contractNames = ["WithinPolicyExecutor", "WithinMultisigExecutor", "WithinCreditFacility"];
for (const name of contractNames) {
  if (!artifact.contracts?.[name]?.address) {
    throw new Error(`Missing ${name} address in deployments/arc-testnet.json. Deploy and sync the artifact before verification.`);
  }
}

const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
};
const encode = (signature, args) => {
  const result = spawnSync("cast", ["abi-encode", signature, ...args], { cwd: contractsDir, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || `Could not encode ${signature}.`);
  return result.stdout.trim();
};

const constructors = {
  WithinPolicyExecutor: encode("constructor(address,address)", [required("TREASURY_ADDRESS"), required("TREASURY_ADDRESS")]),
  WithinMultisigExecutor: encode("constructor(address[],uint256)", [`[${required("MULTISIG_SIGNER_1")},${required("MULTISIG_SIGNER_2")},${required("MULTISIG_SIGNER_3")}]`, required("MULTISIG_THRESHOLD")]),
  WithinCreditFacility: encode("constructor(address,address,address,uint256,uint16,address)", [required("USDC_ADDRESS"), required("BORROWER_TREASURY_ADDRESS"), artifact.contracts.WithinMultisigExecutor.address, String(BigInt(required("CREDIT_LIMIT_USDC")) * 1_000_000n), required("CREDIT_RATE_BPS"), required("TREASURY_ADDRESS")]),
};

for (const name of contractNames) {
  const deployment = artifact.contracts[name];
  const result = spawnSync("forge", ["verify-contract", deployment.address, `src/${name}.sol:${name}`, "--constructor-args", constructors[name], "--chain-id", "5042002", "--compiler-version", "0.8.24", "--verifier", "blockscout", "--verifier-url", "https://testnet.arcscan.app/api/", "--watch"], { cwd: contractsDir, encoding: "utf8", stdio: "inherit" });
  if (result.status !== 0) throw new Error(`${name} verification failed; the artifact was not marked verified.`);
  deployment.verified = true;
  writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);
}
console.log("All deployed contracts were verified successfully.");
