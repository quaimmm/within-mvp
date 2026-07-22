export const withinMultisigExecutorAbi = [
  { type: "function", name: "threshold", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "isSigner", stateMutability: "view", inputs: [{ name: "", type: "address" }], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "hasApproved", stateMutability: "view", inputs: [{ name: "", type: "bytes32" }, { name: "", type: "address" }], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "propose", stateMutability: "nonpayable", inputs: [{ name: "transactionId", type: "bytes32" }, { name: "recipient", type: "address" }, { name: "value", type: "uint256" }, { name: "data", type: "bytes" }, { name: "expiresAt", type: "uint64" }], outputs: [] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "transactionId", type: "bytes32" }], outputs: [] },
  { type: "function", name: "execute", stateMutability: "nonpayable", inputs: [{ name: "transactionId", type: "bytes32" }], outputs: [] },
  { type: "function", name: "cancel", stateMutability: "nonpayable", inputs: [{ name: "transactionId", type: "bytes32" }], outputs: [] },
  { type: "function", name: "getTransaction", stateMutability: "view", inputs: [{ name: "transactionId", type: "bytes32" }], outputs: [{ name: "transaction", type: "tuple", components: [{ name: "proposer", type: "address" }, { name: "recipient", type: "address" }, { name: "value", type: "uint256" }, { name: "expiresAt", type: "uint64" }, { name: "approvals", type: "uint32" }, { name: "executed", type: "bool" }, { name: "cancelled", type: "bool" }, { name: "data", type: "bytes" }] }] },
] as const;
