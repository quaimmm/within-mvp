"use client";

import { useEffect, useState } from "react";
import {
  CONFIRMED_ARC_POLICY,
  isExpectedConfirmedArcPolicy,
  type ConfirmedArcPolicyState,
} from "@/lib/policies/confirmed-arc-policy";
import { ARC_TESTNET, shortenAddress } from "@/lib/arc/network";

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
  const [copiedField, setCopiedField] = useState<"policy" | "contract" | "transaction" | null>(null);

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

  function copyValue(field: "policy" | "contract" | "transaction", value: string) {
    void navigator.clipboard.writeText(value).then(() => setCopiedField(field));
  }

  const technicalValue = (field: "policy" | "contract" | "transaction", value: string) => (
    <dd className="flex min-w-0 items-center justify-end gap-4">
      <span title={value} className="truncate font-mono text-[10px] text-ink">{shortenAddress(value)}</span>
      <button type="button" onClick={() => copyValue(field, value)} className="shrink-0 text-[9px] text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">{copiedField === field ? "Copied" : "Copy"}</button>
    </dd>
  );

  return (
    <section className="mt-20 border-t border-border pt-10" aria-label="Confirmed Arc policy">
      <div>
        <p className={`text-[10px] ${confirmed ? "text-success" : "text-muted"}`}>
          {confirmed ? "✓ Active on Arc" : error ? "Arc policy read unavailable" : "Reading policy from Arc Testnet…"}
        </p>
        <h3 className="mt-3 text-[28px] font-normal tracking-[-0.04em] text-ink">Engineering AI Tools</h3>
      </div>

      <dl className="mt-8 grid grid-cols-2 divide-x divide-border border-y border-border py-6">
        <div className="pr-10"><dt className="text-[9px] text-faint">Per transaction</dt><dd className="mt-2 text-[25px] tracking-[-0.04em] text-ink">{CONFIRMED_ARC_POLICY.maxPerTransactionDisplay} USDC</dd></div>
        <div className="pl-10"><dt className="text-[9px] text-faint">Period limit</dt><dd className="mt-2 text-[25px] tracking-[-0.04em] text-ink">{CONFIRMED_ARC_POLICY.periodLimitDisplay} USDC</dd></div>
      </dl>
      <p className="mt-5 text-[11px] leading-5 text-muted">Settlement is limited to {CONFIRMED_ARC_POLICY.maxPerTransactionDisplay} USDC per transaction and {CONFIRMED_ARC_POLICY.periodLimitDisplay} USDC per policy period.</p>

      <a
        href={`${ARC_TESTNET.explorerUrl}/tx/${CONFIRMED_ARC_POLICY.transactionHash}`}
        target="_blank"
        rel="noreferrer"
        className="mt-5 inline-block text-[10px] text-accent outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent/20"
      >
        View on ArcScan ↗
      </a>

      <details className="group mt-6 border-y border-border text-[10px]">
        <summary className="flex cursor-pointer list-none items-center justify-between py-4 text-muted marker:hidden">Onchain details<span className="text-faint transition-transform group-open:rotate-180">⌄</span></summary>
        <dl className="space-y-4 border-t border-border py-5">
          <div className="grid min-w-0 grid-cols-[110px_1fr] items-center gap-6"><dt className="text-faint">Policy key</dt>{technicalValue("policy", CONFIRMED_ARC_POLICY.policyKey)}</div>
          <div className="grid min-w-0 grid-cols-[110px_1fr] items-center gap-6"><dt className="text-faint">Contract</dt>{technicalValue("contract", CONFIRMED_ARC_POLICY.contractAddress)}</div>
          <div className="grid min-w-0 grid-cols-[110px_1fr] items-center gap-6"><dt className="text-faint">Transaction</dt>{technicalValue("transaction", CONFIRMED_ARC_POLICY.transactionHash)}</div>
          <div className="flex items-center justify-between gap-8"><dt className="text-faint">Block</dt><dd>{CONFIRMED_ARC_POLICY.blockNumber.toLocaleString("en-GB")}</dd></div>
          <div className="flex items-center justify-between gap-8"><dt className="text-faint">Network</dt><dd>Arc Testnet</dd></div>
        </dl>
      </details>
    </section>
  );
}
