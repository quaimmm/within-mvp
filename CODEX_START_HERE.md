# Start Within in Codex Desktop

## 1. Create/open a local folder
Create a folder named `within-mvp`, extract all files from this starter pack into it, then open that folder as the Codex project/workspace.

## 2. First message to Codex
Paste this exactly:

> Read `AGENTS.md`, `README.md`, and the entire current codebase before changing anything. This is a desktop-first premium fintech MVP called Within. First, verify Node.js and npm are available. Install dependencies with `npm ci`, run `npm run lint`, run `npm run build`, then launch the app with `npm run dev`. Use the in-app browser to inspect the app at localhost. Do not redesign anything yet. Report any errors, fix only errors required to make the current project run, and tell me the exact local URL.

## 3. What you should see
- Left navigation
- Premium Overview page
- Team profile view
- Approval flow
- Natural-language rule creation
- Employee payment demo
- Mock payment success and updated activity

## 4. Second message to Codex — visual review

> Open the running app in the in-app browser and inspect every desktop page at 1440×900. Preserve the current art direction. Identify only visible spacing, alignment, overflow, typography, accessibility or interaction defects. Fix those defects without adding new features, without introducing gradients, and without turning the interface into a generic dashboard. Run lint and build afterward.

## 5. Third message — save a stable milestone

> Initialise Git if it is not already initialised. Create a commit named `chore: establish within desktop design system and mock flow`. Do not publish anything yet.

## 6. Arc integration comes later
Do not begin Arc integration until the mock flow is visually polished and stable.
