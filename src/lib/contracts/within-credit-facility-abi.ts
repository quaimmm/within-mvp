export const withinCreditFacilityAbi = [
  { type: "function", name: "creditLimit", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "availableCredit", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "facilityBalance", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "totalOutstandingPrincipal", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "requestDrawdown", stateMutability: "nonpayable", inputs: [{ name: "amount", type: "uint256" }, { name: "termDays", type: "uint32" }, { name: "purposeHash", type: "bytes32" }], outputs: [{ name: "requestId", type: "uint256" }] },
  { type: "function", name: "approveAndDisburse", stateMutability: "nonpayable", inputs: [{ name: "requestId", type: "uint256" }], outputs: [{ name: "loanId", type: "uint256" }] },
  { type: "function", name: "repay", stateMutability: "nonpayable", inputs: [{ name: "loanId", type: "uint256" }, { name: "amount", type: "uint256" }], outputs: [] },
  { type: "function", name: "getDrawdownRequest", stateMutability: "view", inputs: [{ name: "requestId", type: "uint256" }], outputs: [{ name: "request", type: "tuple", components: [{ name: "borrower", type: "address" }, { name: "amount", type: "uint256" }, { name: "termDays", type: "uint32" }, { name: "purposeHash", type: "bytes32" }, { name: "status", type: "uint8" }, { name: "loanId", type: "uint256" }] }] },
  { type: "function", name: "getLoan", stateMutability: "view", inputs: [{ name: "loanId", type: "uint256" }], outputs: [{ name: "loan", type: "tuple", components: [{ name: "requestId", type: "uint256" }, { name: "principal", type: "uint256" }, { name: "totalDue", type: "uint256" }, { name: "amountRepaid", type: "uint256" }, { name: "outstandingPrincipal", type: "uint256" }, { name: "maturityDate", type: "uint64" }, { name: "status", type: "uint8" }] }] },
] as const;
