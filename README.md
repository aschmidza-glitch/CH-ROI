# Whzan Care Home ROI Calculator

A self-contained React calculator for the care home's own gross retained revenue (before margin),
built on the Health Foundation IAU 2019 evidence base. Vercel-deployable and embeddable in monday.com.

## Run locally

Requires Node.js 18+.

```bash
npm install
npm run dev
```

Open the localhost URL it prints.

## Build

```bash
npm run build      # outputs to dist/
npm run preview    # serves the production build locally to check it
```

## Deploy to Vercel

### Option A: GitHub-connected (recommended, auto-redeploys)

1. Push this folder to a new GitHub repo.
2. On vercel.com: Add New... > Project, import the repo.
3. Vercel auto-detects Vite. Leave defaults (build `npm run build`, output `dist`).
4. Deploy. You get a URL like `https://carehome-roi.vercel.app`.
5. Every future `git push` redeploys automatically.

### Option B: Vercel CLI

```bash
npm install -g vercel
vercel          # follow prompts, accept defaults
vercel --prod   # production URL
```

## Embed in monday.com

1. Open the target dashboard (or create one from a board's top tabs: + > Dashboard).
2. Click "Add Widget" > "see more" > "Embed Everything".
3. Paste your Vercel URL into the field in the right-hand pane.
4. Size the widget; give it a wide, deep tile as the calculator is tall.

## Notes

- Inputs are session-only; nothing is saved server-side, so each viewer gets a fresh calculator.
- The illustrative clinical activity panel (A&E, admissions, ambulance) is context only and does
  not affect the price or ROI.
- Brand colours and evidence sourcing are baked into the component.
