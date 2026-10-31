# TESSERA — frontend

A new, self-contained interface for TESSERA (intelligent campus scheduling & resource
management), built with Vite + React 18 + TypeScript.

The scheduling backend under `api/` is **not** touched by this app: it is consumed read-mostly
through its documented HTTP contract, and every write goes through an endpoint that already
exists.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173  (proxies /api, /health, /docs to the API)
```

The dev server proxies to `http://127.0.0.1:8000` by default; override with
`TESSERA_API=http://host:port npm run dev`. Start the API first:

```bash
.venv/bin/python -m uvicorn api.app.main:app --port 8000
```

Build and preview a production bundle:

```bash
npm run build && npm run preview   # http://localhost:4173
```

## Two data modes — always visible in the UI

| Mode | When | What the badge says |
| --- | --- | --- |
| **Live API** | `/health` answers and `demo-login` issues a token | `LIVE API` + dataset id |
| **Snapshot** | the API is down or unreachable | `SNAPSHOT` + dataset id |

`src/data/snapshot.json` is a read-only capture of the same public dataset, produced by
`scripts/make_snapshot.py` from the real endpoints. It is a fallback, never a simulation of a
write: in snapshot mode the interface says plainly that moves are rehearsed in the browser and
nothing is sent to the scheduler.

## Structure

```
src/
  App.tsx, main.tsx        routing, providers, font + style entry
  lib/
    types.ts               the workspace contract (superset of the API responses)
    api.ts                 the only place that talks to the network
    workspace.tsx          React context: data, persona, pending change, toasts
    derive.ts              scheduling analysis: occupancy, conflicts, validation, impact
    format.ts, persona.ts   presentation helpers, room photography, tones
    nlp.ts                 browser-side fallback parser (labelled as such in the UI)
  components/              shell, board, drawers, popover, palette, toaster
  styles/                  tokens + base, shell, ui, board, pages
  pages/                   Mosaic Board, Overview, Ripple Effect, Discovery, Availability,
                           People, Bookings, Intelligence, Reports, Departments, Groups,
                           Locations, Settings
```

## Checks

```bash
npm run typecheck    # strict TypeScript, noUnusedLocals
npm run build
npm run smoke        # renders every route in jsdom with the API stubbed (offline mode)
npm run smoke -- --live   # same, against a running API + dev server
```

`npm run smoke` also exercises the interactions that matter: sidebar collapse, session card,
perspective switch, natural-language booking, drag-and-reflow validation, and the AI transcript.

## Visual system

Warm paper canvas, charcoal rail, `.serif` (Instrument Serif) for editorial numbers, Space
Grotesk for interface type, IBM Plex Mono for technical metadata. Colour is functional, not
decorative: lime = valid action, violet = AI/pending, coral = conflict, sage = healthy,
sky = resource, sand = caution.
