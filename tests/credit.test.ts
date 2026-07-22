import assert from "node:assert/strict";
import test from "node:test";
import { createCleanDemoState } from "../src/data/demo-state.ts";
import { approveCreditRequest, calculateSimpleInterest, classifyCreditRequest, creditAvailable, creditOutstanding, disburseCreditRequest, repayCreditLoan, saveCreditRequest, validateCreditRequest } from "../src/lib/credit/demo-credit.ts";
import { mapCreditContractState, validateLiveCreditConfiguration } from "../src/lib/credit/live-credit.ts";

const input = { amount: 750, purpose: "Software procurement", department: "Engineering", termDays: 90 as const, treasuryDestination: "", supportingNote: "", policyId: "POL-ENG-AI-001" };

test("credit request validation and deterministic simple interest", () => {
  const state=createCleanDemoState();
  assert.doesNotThrow(()=>validateCreditRequest(input,state));
  assert.throws(()=>validateCreditRequest({...input,amount:0},state),/positive/);
  assert.throws(()=>validateCreditRequest({...input,amount:18_000},state),/available credit/);
  assert.equal(calculateSimpleInterest(7_500,800,180),295.89);
});

test("credit classification selects standard, multisig, and blocked", () => {
  assert.equal(classifyCreditRequest(1_000,"Active"),"Standard finance approval");
  assert.equal(classifyCreditRequest(1_001,"Active"),"Treasury multisig");
  assert.equal(classifyCreditRequest(100,"Paused"),"Blocked");
});

test("drafts can be edited and submitted without duplication", () => {
  const drafted=saveCreditRequest(createCleanDemoState(),input,false);
  const id=drafted.credit.selectedRequestId!;
  const edited=saveCreditRequest(drafted,{...input,amount:900},false,id);
  assert.equal(edited.credit.requests.filter(request=>request.id===id).length,1);
  assert.equal(edited.credit.requests.find(request=>request.id===id)?.amount,900);
  const submitted=saveCreditRequest(edited,{...input,amount:900},true,id);
  assert.equal(submitted.credit.requests.find(request=>request.id===id)?.status,"Awaiting finance approval");
});

test("duplicate signer decisions are prevented and threshold controls disbursement", () => {
  let state=saveCreditRequest(createCleanDemoState(),{...input,amount:5_000,termDays:180},true);
  const id=state.credit.selectedRequestId!;
  state=approveCreditRequest(state,id);
  assert.equal(state.credit.requests.find(request=>request.id===id)?.decisions.length,1);
  const duplicate=approveCreditRequest(state,id);
  assert.equal(duplicate.credit.requests.find(request=>request.id===id)?.decisions.length,1);
  assert.equal(disburseCreditRequest(duplicate,id),duplicate);
  state={...state,treasury:{...state.treasury,currentSignerId:"SIGNER-OLIVIA"}};
  state=approveCreditRequest(state,id);
  assert.equal(state.credit.requests.find(request=>request.id===id)?.status,"Ready to disburse");
  state=disburseCreditRequest(state,id);
  assert.equal(state.credit.requests.find(request=>request.id===id)?.status,"Disbursed");
  assert.equal(creditOutstanding(state.credit),12_500);
  assert.equal(creditAvailable(state.credit),12_500);
  assert.equal(disburseCreditRequest(state,id),state);
});

test("mock partial and full repayments update balances without transaction evidence", () => {
  let state=createCleanDemoState();
  state=repayCreditLoan(state,"LOAN-WORKING-CAPITAL-001",1_250);
  assert.equal(state.credit.loans[0].outstandingPrincipal,6_250);
  assert.equal(state.credit.repayments[0].transactionHash,undefined);
  state=repayCreditLoan(state,"LOAN-WORKING-CAPITAL-001",6_250);
  assert.equal(state.credit.loans[0].status,"Repaid");
  assert.equal(repayCreditLoan(state,"LOAN-WORKING-CAPITAL-001",1),state);
});

test("separate repayments create stable unique activity and remain idempotent", () => {
  let state=createCleanDemoState();
  state=repayCreditLoan(state,"LOAN-WORKING-CAPITAL-001",1_250);
  state=repayCreditLoan(state,"LOAN-WORKING-CAPITAL-001",1_000);
  const events=state.dashboard.activity.filter(item=>item.category==="Demo repayment");
  assert.equal(events.length,2);
  assert.equal(new Set(events.map(item=>item.id)).size,2);
  assert.ok(events.every(item=>item.id===`activity-${item.eventId}`));
  const duplicate=repayCreditLoan(state,"LOAN-WORKING-CAPITAL-001",0);
  assert.equal(duplicate.dashboard.activity.filter(item=>item.category==="Demo repayment").length,2);
});

test("live credit configuration fails safely without wallet, network, contracts, or liquidity", () => {
  const valid={walletAddress:"0x1234567890123456789012345678901234567890",chainId:"0x4CEF52",facilityAddress:"0x2234567890123456789012345678901234567890",multisigAddress:"0x3234567890123456789012345678901234567890",facilityLiquidity:100,requestedAmount:50};
  assert.throws(()=>validateLiveCreditConfiguration({...valid,walletAddress:null}),/wallet/);
  assert.throws(()=>validateLiveCreditConfiguration({...valid,chainId:"0x1"}),/Arc Testnet/);
  assert.throws(()=>validateLiveCreditConfiguration({...valid,facilityAddress:null}),/facility contract/);
  assert.throws(()=>validateLiveCreditConfiguration({...valid,multisigAddress:null}),/multisig/);
  assert.throws(()=>validateLiveCreditConfiguration({...valid,requestedAmount:101}),/insufficient/);
});

test("contract results map ERC-20 six-decimal values", () => {
  const mapped=mapCreditContractState({creditLimit:25_000_000_000n,availableCredit:17_500_000_000n,facilityBalance:25_000_000_000n,principal:7_500_000_000n,totalDue:7_795_890_410n,amountRepaid:0n,outstandingPrincipal:7_500_000_000n,maturity:1_800_000_000n,status:1});
  assert.equal(mapped.creditLimit,25_000);
  assert.equal(mapped.outstandingPrincipal,7_500);
  assert.equal(mapped.status,"Active");
});

test("reset restores seeded credit facility", () => {
  const state=createCleanDemoState();
  assert.equal(state.credit.creditLimit,25_000);
  assert.equal(creditAvailable(state.credit),17_500);
  assert.equal(creditOutstanding(state.credit),7_500);
  assert.equal(state.credit.requests.length,2);
});
