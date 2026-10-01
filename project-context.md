# Project Context

## What this is

A client-side React app: the user uploads a PDF resume, the browser extracts its text with pdf.js, the text is sent to an LLM through Puter.js, and the returned JSON is rendered as a scored analysis dashboard. Portfolio project, deployed on Vercel. No backend.

## Stack

- Language: JavaScript (JSX) — deliberately NOT TypeScript (owner's decision)
- Framework: React 19 + Vite 8
- AI: Puter.js loaded from `https://js.puter.com/v2/` in `index.html` (global `puter`, `puter.ai.chat`). Keep Puter — no serverless backend (owner's decision).
- PDF: `pdfjs-dist` 6 with its worker imported via `?url`
- Styling: plain CSS with custom properties in `src/index.css`; icons from `lucide-react`
- Package manager: npm
- Node: v24 locally

## Commands

- Install: `npm install`
- Run dev: `npm run dev` (http://localhost:5173)
- Lint: `npm run lint`
- Build: `npm run build`
- Test: none yet (planned: Vitest + Playwright)

## Structure

- `src/App.jsx` — thin: picks the upload or report screen
- `src/hooks/useResumeAnalysis.js` — all upload-flow state and actions
- `src/services/` — side effects: `pdf.js` (lazy pdf.js extraction), `analyze.js` (the only file that touches `puter`)
- `src/lib/` — pure helpers only (no React, no puter, no pdf.js): normalization, errors, AI-failure mapping, file checks, limits, resume checks, score blending
- `src/components/` — UploadView, JobDescriptionInput, DashboardView, ErrorBoundary
- `src/index.css` — all styles and design tokens; no inline styles except data-driven CSS custom properties (`--score`, `--value`)

## Conventions

- Dark theme, emerald `--primary` / cyan `--secondary`; reuse the CSS variables, don't hardcode new colors.
- Error/warning strings state what happened plus what the user can do. Never assert a cause that wasn't verified (no "because…", "this means…").
- Every UI change must not cause horizontal overflow at 390px width.

## Do not touch

- `node_modules/`, `dist/` (untracked, generated)

## Agent rules

- NEVER run `git commit` or `git push`. The owner commits. Never add AI attribution to anything.
- Do not add a backend, TypeScript, Tailwind or a UI library without asking.

## Known gotchas

- `puter` is a global from a script tag; ESLint needs `/* global puter */` (only in services/analyze.js).
- pdf.js is dynamically imported. Chrome caches a failed dynamic import for the page's lifetime, so a retry needs a reload. Never add a global `vite:preloadError` → reload handler.
- The first `puter.ai.chat` call may open a Puter sign-in popup for the visitor.
- The AI model is pinned in one place: `AI_MODEL` in src/services/analyze.js. Call form is `puter.ai.chat(messages, false, { model, normalize: true })`. Puter has no JSON mode, and per-model support for `temperature`/`max_tokens` is unverified, so don't add them.
- Puter rejections can be Errors, plain objects or raw XMLHttpRequests; always go through `describeAiFailure` (lib/aiErrors.js), never read `.message` directly.
- Score = 70% AI + 30% code checks (lib/report.js). Resume checks run on the FULL extracted text, before the 15,000-char AI cap.
