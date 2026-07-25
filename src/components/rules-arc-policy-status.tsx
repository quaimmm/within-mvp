"use client";

import { useEffect, useState } from "react";
import {
  CONFIRMED_ARC_POLICY,
  isExpectedConfirmedArcPolicy,
  type ConfirmedArcPolicyState,
} from "@/lib/policies/confirmed-arc-policy";
import { ARC_TESTNET } from "@/lib/arc/network";

let policyRequest: Promise<ConfirmedArcPolicyState> | null = null;

function requestConfirmedPolicy() {
  policyRequest ??= fetch("/api/policies/confirmed", { method: "GET" })
    .then(async (response) => {
      const result = await response.json() as {
        success: boolean;
        policy?: { exists: boolean; active: boolean; maxPerTransaction: string; periodLimit: string };
      };
      if (!response.ok || !result.success || !result.policy) throw new Error("Policy read failed.");
      return {
        exists: result.policy.exists,
        active: result.policy.active,
        maxPerTransaction: BigInt(result.policy.maxPerTransaction),
        periodLimit: BigInt(result.policy.periodLimit),
      };
    })
    .catch((error) => {
      policyRequest = null;
      throw error;
    });
  return policyRequest;
}

export function RulesArcPolicyStatus() {
  const [policy, setPolicy] = useState<ConfirmedArcPolicyState | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let current = true;
    window.__WITHIN_ARC_METHOD_COUNTS__ ??= { eth_call: 0, eth_sendTransaction: 0 };
    window.__WITHIN_ARC_METHOD_COUNTS__.eth_call += 1;
    requestConfirmedPolicy()
      .then((result) => {
        if (current) setPolicy(result);
      })
      .catch(() => {
        if (current) setError(true);
      });
    return () => {
      current = false;
    };
  }, []);

  const confirmed = policy ? isExpectedConfirmedArcPolicy(policy) : false;
  const valueClass = "mt-1 break-all text-[10px] leading-5 text-ink";

  return (
    <section className="mt-20 border-t border-border pt-10" aria-label="Confirmed Arc policy">
      <div className="flex items-start justify-between gap-8">
        <div>
          <p className={`text-[10px] ${confirmed ? "text-success" : "text-muted"}`}>
            {confirmed ? "Policy active on Arc Testnet" : error ? "Arc policy read unavailable" : "Reading policy from Arc Testnet…"}
          </p>
          <h3 className="mt-3 text-[24px] font-normal tracking-[-0.04em] text-ink">Engineering AI Tools</h3>
        </div>
        {confirmed && <span className="mt-1 text-[10px] text-success">Active</span>}
      </div>

      <dl className="mt-8 grid grid-cols-2 gap-x-12 gap-y-5 border-y border-border py-6">
        <div className="col-span-2"><dt className="text-[9px] text-faint">Policy key</dt><dd className={valueClass}>{CONFIRMED_ARC_POLICY.policyKey}</dd></div>
        <div className="col-span-2"><dt className="text-[9px] text-faint">Contract</dt><dd className={valueClass}>{CONFIRMED_ARC_POLICY.contractAddress}</dd></div>
        <div><dt className="text-[9px] text-faint">Per-transaction limit</dt><dd className={valueClass}>{CONFIRMED_ARC_POLICY.maxPerTransactionDisplay}</dd></div>
        <div><dt className="text-[9px] text-faint">Period limit</dt><dd className={valueClass}>{CONFIRMED_ARC_POLICY.periodLimitDisplay}</dd></div>
        <div><dt className="text-[9px] text-faint">Block</dt><dd className={valueClass}>{CONFIRMED_ARC_POLICY.blockNumber.toLocaleString("en-GB")}</dd></div>
        <div><dt className="text-[9px] text-faint">Transaction</dt><dd className={valueClass}>{CONFIRMED_ARC_POLICY.transactionHash}</dd></div>
      </dl>

      <a
        href={`${ARC_TESTNET.explorerUrl}/tx/${CONFIRMED_ARC_POLICY.transactionHash}`}
        target="_blank"
        rel="noreferrer"
        className="mt-5 inline-block text-[10px] text-accent outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent/20"
      >
        View on ArcScan
      </a>
    </section>
  );
}
