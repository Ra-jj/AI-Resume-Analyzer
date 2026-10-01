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

- `src/App.jsx` — upload handling, PDF extraction, AI call, view switching
- `src/components/UploadView.jsx`, `src/components/DashboardView.jsx` — the two screens
- `src/index.css` — all styles and design tokens

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

- `puter` is a global from a script tag; ESLint needs `/* global puter */`.
- The first `puter.ai.chat` call may open a Puter sign-in popup for the visitor.
