"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SectionTitle } from "@/components/ui/section-title";
import type { DemoState } from "@/data/demo-state";
import type { DemoStateSetter } from "@/components/product-pages";

type SettingsSection = "Company" | "People & access" | "Treasury";

const inputClass = "mt-2 h-10 w-full rounded-lg border border-border bg-white px-3 text-[11px] text-ink outline-none transition-colors focus:border-accent";

export function SettingsPage({ state, setState }: { state: DemoState; setState: DemoStateSetter; onReset: () => void; onSignOut: () => void }) {
  const [section, setSection] = useState<SettingsSection>("Company");
  const [message, setMessage] = useState("");
  const updateCompany = (key: keyof DemoState["company"], value: string | boolean) => setState((current) => ({ ...current, company: { ...current.company, [key]: value } }));
  const updateUser = (key: "firstName" | "lastName", value: string) => setState((current) => ({ ...current, signedInUser: { ...current.signedInUser, [key]: value } }));

  return <div className="mx-auto max-w-[1120px]">
    <SectionTitle title="Settings" description="Company setup and access." />
    <div className="mt-10 flex gap-6 border-b border-border">
      {(["Company", "People & access", "Treasury"] as const).map((value) => <button key={value} onClick={() => setSection(value)} className={`pb-4 text-[11px] ${section === value ? "border-b border-ink text-ink" : "text-muted"}`}>{value}</button>)}
    </div>
    {section === "Company" && <section className="mt-12 max-w-2xl">
      <h3 className="text-[22px]">Your profile</h3>
      <div className="grid grid-cols-2 gap-4">
        {([["First name", "firstName"], ["Last name", "lastName"]] as const).map(([label, key]) => <label key={key} className="mt-6 block text-[10px] text-muted">{label}<input aria-label={label} value={state.signedInUser[key]} onChange={(event) => updateUser(key, event.target.value)} className={inputClass} /></label>)}
      </div>
      <div className="mt-12 border-t border-border pt-12">
      <h3 className="text-[22px]">Company</h3>
      {([["Company name", "companyName"], ["Company email domain", "emailDomain"], ["Finance email", "financeEmail"], ["Default currency", "currency"], ["Company timezone", "timezone"]] as const).map(([label, key]) => <label key={key} className="mt-6 block text-[10px] text-muted">{label}<input aria-label={label} value={String(state.company[key])} onChange={(event) => updateCompany(key, event.target.value)} className={inputClass} /></label>)}
      <label className="mt-6 flex items-center gap-3 text-[11px]"><input type="checkbox" checked={state.company.requireCompanyEmails} onChange={(event) => updateCompany("requireCompanyEmails", event.target.checked)} />Require company-domain emails</label>
      </div>
      <Button variant="primary" onClick={() => setMessage("Settings saved")} className="mt-8">Save changes</Button>
    </section>}
    {section === "People & access" && <section className="mt-12 max-w-2xl">
      <h3 className="text-[22px]">People & access</h3>
      {[["Administrator", "Full company and treasury access"], ["Finance Manager", "Rules, approvals and reporting"], ["Team Manager", "Approvals for assigned departments"], ["Employee", "Purchase requests and own activity"]].map(([label, description]) => <div key={label} className="border-b border-border py-5"><p className="text-[11px]">{label}</p><p className="mt-1 text-[10px] text-muted">{description}</p></div>)}
    </section>}
    {section === "Treasury" && <section className="mt-12 max-w-2xl">
      <p className="text-[10px] text-accent">Arc Testnet Beta</p>
      <h3 className="mt-3 text-[22px]">Treasury</h3>
      <p className="mt-4 text-[11px] leading-6 text-muted">Treasury actions are available when their Arc Testnet providers are configured.</p>
      <p className="mt-2 text-[10px] text-faint">Testnet assets only.</p>
    </section>}
    {message && <div role="status" className="fixed bottom-6 right-6 rounded-xl bg-ink px-4 py-3 text-[11px] text-white">{message}</div>}
  </div>;
}
