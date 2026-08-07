# Within persistence architecture

Within's Arc Testnet Beta does not require an application database. The release architecture is:

`Browser / MetaMask → Next.js frontend → Arc RPC → Policy contract / Employee Credit contract / Arc Testnet USDC`

## Sources of truth

- Arc Testnet is the source of truth for active policy state, employee eligibility, available credit, outstanding principal, repayment state, pool liquidity, and confirmed financial outcomes.
- MetaMask supplies wallet identity only after an explicit connection in the current browser page session.
- Public contract addresses, chain metadata, RPC URLs, and known deployment evidence are application configuration. They are identifiers used to find onchain state, not duplicated financial state.
- Transaction hashes may be cached in session storage to make receipt recovery convenient. A cached hash never replaces a receipt or contract read.
- Approvals, cards, team, analytics, organisation settings, rule-builder drafts, and other non-financial workflow content are seeded frontend state. In the current release they are stored in React state and, where demo mode is enabled, in browser session storage.

## Refresh and recovery

On refresh, Employee Credit balances and account status are read again from Arc. A locally cached transaction hash is checked against its receipt before the interface treats it as confirmed. When transaction metadata is absent, the application shows an honest device-local empty state and does not construct history.

The wallet connection is deliberately memory-only. A full page reload returns the interface to a disconnected state and requires an explicit MetaMask connection.

Browser workflow state can survive a same-tab refresh through session storage, but it is not shared across browsers or devices. Clearing browser storage restores the seeded workspace. None of these actions change Arc financial state.

## Future database boundary

A future production database can store organisations and members, approval requests and comments, indexed audit logs, notifications, user preferences, and offchain transaction metadata. It must not replace Arc as the source of truth for balances, eligibility, debt, repayments, pool liquidity, policy activation, receipts, or other confirmed financial state.
