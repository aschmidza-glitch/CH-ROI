# Whzan Care Home P&L ROI Calculator

Single-page React (Vite) app. Deployed to Vercel at ch-roi.vercel.app.

## Local development

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build      # outputs to /dist
npm run preview    # serve the built /dist locally
```

## Deployment (Vercel)

Vercel auto-detects Vite. Settings if you need them:

- Framework preset: **Vite**
- Build command: `npm run build`
- Output directory: `dist`
- Install command: `npm install`

## Structure

- `src/CareHomeROICalculator.jsx` — the calculator (all logic and UI)
- `src/App.jsx` — renders the calculator
- `src/main.jsx` — React entry point
- `src/index.css` — full-height layout

## Embedding in Monday.com

The app runs full-page and can be embedded via iframe using the Vercel URL.

## Calculation basis (summary)

Headline is the care home's own **gross retained revenue**, valued on a **void-cycle** basis:
each prevented permanent loss saves one bed-refill cycle (void weeks x weekly fee + average
refill cost). Placement loss on admission is set at 20% (in-hospital death ~12% plus a survivor
non-return increment ~8pp). Effect size is locked at the central 22%. Whzan price is locked at
£5.00/bed/month, £4.50 at 500+ beds. See the in-app source notes for full citations.
