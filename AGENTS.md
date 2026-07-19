# Within — Agent Instructions

## Product principle
Within is a premium desktop-first company-spending product. It should feel calm, crafted, human and trustworthy. The visible product must never feel like a crypto wallet or a generic admin template.

## Non-negotiable visual rules
- Preserve the warm porcelain canvas, near-black type, restrained blue and subtle borders.
- Use thin/regular typography. Avoid bold-heavy dashboards.
- Keep generous whitespace and editorial hierarchy.
- Do not wrap every element in a card.
- Do not add gradients, glassmorphism, neon, coins, wallet addresses, gas selectors or seed phrases.
- Avoid installing a UI kit unless explicitly requested. Bespoke components are preferred.
- Desktop first. Do not add mobile layouts until explicitly requested.
- Any new page must reuse the current visual language and CSS variables.

## Architecture rules
- UI components must not call blockchain SDKs directly.
- All payment execution goes through the PaymentProvider interface in `src/lib/services/payments/types.ts`.
- Keep `MockPaymentProvider` working while adding Arc.
- Implement Arc in `ArcPaymentProvider`, selected through configuration later.
- Funding methods remain behind provider abstractions. Apple Pay is a future provider, not a fake working button.
- Never put secrets or private keys in browser code or committed files.

## Development workflow
1. Inspect the current app in the browser before changing visual code.
2. Make the smallest coherent change.
3. Run lint and build after meaningful changes.
4. Preserve existing working demo flows.
5. Summarise modified files, tests run and anything still mocked.

## Current MVP flow
Manager overview → create natural-language rule → review approval → employee payment demo → mock settlement → activity updates.
