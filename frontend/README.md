# Frontend — building geometry case study

Vite + React (plain JS) with MUI for the panels and plain SVG for the plan; the design is in
`docs/DESIGN.md`, "Visualization".

## Getting started

```bash
npm install
npm run dev        # http://localhost:5173
```

The backend base URL defaults to `http://localhost:8000`; override with
`VITE_API_BASE` (see `.env.example`). With the root `docker compose up`, both run together.

## What's here

- `src/App.jsx` — state and behaviour: site and option selection, the live preview (debounced, numbered requests,
  stale responses dropped), saving and branching options.
- `src/components/TopPanel.jsx` — the "Create site" dialog (coordinates pasted as text), site selector, option list,
  backend health mark (`GET /health`, polled).
- `src/components/OptionSelect.jsx` — the option list as a dropdown: "New option" first, then the tree indented by depth;
  while the form is edited it names the draft, "New option from X".
- `src/components/Inspector.jsx` — the constraint form, metrics, verdict, parent comparison, "Add option" and "Reset option".
- `src/components/Plan.jsx` — the top-down plan in SVG: site polygon, footprint, the parent's footprint dashed.
- `src/lib/api.js` — fetch client for the API (`docs/DESIGN.md`, "API contract").
- `src/lib/ui.js` — shared bits: verdict colours and labels, number formatting, the error helper style.

Lint: `npm run lint` (biome; `npx biome check --write src` to format).

## Commands

```bash
npm run dev        # dev server
npm run build      # production build
npm run preview    # preview the build
```
