# Project Context

## What this is

A client-side React app: the user uploads a PDF resume, the browser extracts its text with pdf.js, the text is sent to an LLM through Puter.js, and the returned JSON is rendered as a scored analysis dashboard. Portfolio project, deployed on Vercel. No backend.

## Stack

- Language: JavaScript (JSX) — deliberately NOT TypeScript (owner's decision)
- Framework: React 19 + Vite 8
- AI: Puter.js loaded from `https://js.puter.com/v2/` in `index.html` (global `puter`, `puter.ai.chat`). Keep Puter — no serverless backend (owner's decision).
- PDF: `pdfjs-dist` 6.4 (must stay ≥6.2.108: GHSA-hq66-cqwq-w95j) with its minified worker imported via `pdf.worker.min.mjs?url`
- Styling: plain CSS with custom properties in `src/index.css`; icons from `lucide-react`
- Package manager: npm
- Node: v24 locally

## Commands

- Install: `npm install`
- Run dev: `npm run dev` (http://localhost:5173)
- Lint: `npm run lint`
- Build: `npm run build`
- Test: `npm test` (Vitest, `src/**/*.test.js`, node environment; `npm run test:watch` for watch mode).
- E2E: `npm run test:e2e` (Playwright, Chromium only, `e2e/*.spec.js`; run `npx playwright install chromium` once). Builds and serves a fresh production build on port 4317 (never reuses a running server); Puter, Google Fonts and every other external host are blocked/stubbed (`e2e/helpers/`). Fixtures in `e2e/fixtures/`.
- CI: `.github/workflows/ci.yml` runs `npm ci` → lint (`--max-warnings=0`) → `npm test` → build → Playwright install → `npm run test:e2e` on Node 22; uploads the Playwright report on failure.

## Structure

- `src/App.jsx` — thin: picks the upload or report screen
- `src/hooks/useResumeAnalysis.js` — all upload-flow state and actions; `stage` ("reading" | "analyzing" | null) drives the progress steps, `loading = stage !== null`
- `src/services/` — side effects: `pdf.js` (lazy pdf.js extraction), `analyze.js` (the only file that touches `puter`)
- `src/lib/` — pure helpers only (no React, no puter, no pdf.js): normalization, errors, AI-failure mapping, file checks, limits, resume checks, score blending + rating thresholds (`report.js`), prompt building (`prompt.js`), the ranked to-do list (`fixFirst.js`), and the fictional sample report built through the real pipeline (`sampleReport.js`; must never import services/)
- Tests are colocated as `*.test.js` next to the module they cover
- `src/components/` — UploadView, JobDescriptionInput, AnalysisProgress (+ `AnalysisStatus`, the single always-present `role="status"` line rendered by UploadView), DashboardView, ErrorBoundary
- e2e helpers: use `loadingHeading(page)` / `analysisStatus(page)` (e2e/helpers/test.js) rather than `getByRole("status")` to detect loading
- `vercel.json` — security headers (no script/connect CSP, no COOP/COEP: they would break Puter.js). `vite.config.js` reads the same headers into `preview.headers`, so e2e runs under them.
- `docs/screenshots/` — README images (fictional data)
- `src/index.css` — all styles and design tokens; no inline styles except data-driven CSS custom properties (`--score`, `--value`)

## Conventions

- Dark theme, emerald `--primary` / cyan `--secondary`; reuse the CSS variables, don't hardcode new colors.
- Error/warning strings state what happened plus what the user can do. Never assert a cause that wasn't verified (no "because…", "this means…").
- Every UI change must not cause horizontal overflow at 390px width (tests also check 360 and 320).
- Focus: the report `<h1>` gets programmatic focus on open; App owns `initialFocus` for the upload view — "Analyze another resume" and "Analyze your own resume" → file input, "Back to home" (from the sample) → "See a full sample report" button; nothing takes focus on first load.
- Sample mode (`isSample` on DashboardView): banner is plain text, never a live region; it must never trigger pdf.js or Puter.
- User-visible copy: no em/en dashes in check labels/details (unit-tested).
- Respect `prefers-reduced-motion`; print layout uses the `--print-*` tokens in index.css.
- Score ratings come only from `getScoreRating()` in lib/report.js.

## Do not touch

- `node_modules/`, `dist/` (untracked, generated)

## Agent rules

- NEVER run `git commit` or `git push`. The owner commits. Never add AI attribution to anything.
- Do not add a backend, TypeScript, Tailwind or a UI library without asking.

## Known gotchas

- `puter` is a global from a script tag; ESLint needs `/* global puter */` (only in services/analyze.js).
- X-Frame-Options DENY blocks iframe-based layout measurement against the preview server; use Playwright viewport emulation.
- pdf.js is dynamically imported. Chrome caches a failed dynamic import for the page's lifetime, so a retry needs a reload. Never add a global `vite:preloadError` → reload handler.
- The first `puter.ai.chat` call may open a Puter sign-in popup for the visitor.
- The AI model is pinned in one place: `AI_MODEL` in src/services/analyze.js. Call form is `puter.ai.chat(messages, false, { model, normalize: true })`. Puter has no JSON mode, and per-model support for `temperature`/`max_tokens` is unverified, so don't add them.
- Puter rejections can be Errors, plain objects or raw XMLHttpRequests; always go through `describeAiFailure` (lib/aiErrors.js), never read `.message` directly.
- Score = 70% AI + 30% code checks (lib/report.js). Resume checks run on the FULL extracted text, before the 15,000-char AI cap.
