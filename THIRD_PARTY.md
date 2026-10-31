# Third-party software

Every library, solver and asset the project uses, what it is used for, and its licence.

## Solver / backend

| Package | Version | Used for | Licence |
| --- | --- | --- | --- |
| OR-Tools (`ortools`) | 9.15.6755 | CP-SAT: timetable generation, exam scheduling, minimal-move repair | Apache-2.0 |
| FastAPI | 0.115.6 | HTTP API | MIT |
| Uvicorn | 0.34.0 | ASGI server | BSD-3-Clause |
| Pydantic | 2.10.4 | request/response schemas | MIT |
| SQLModel | 0.0.22 | persistence layer (SQLite) | MIT |
| SQLAlchemy | 2.x (via SQLModel) | database engine; file-backed SQLite, WAL mode | MIT |
| SQLite | Python stdlib | the database itself (one file, no server) | public domain |
| PyJWT | 2.10.1 | session tokens for the four roles | MIT |
| httpx | 0.28.1 | LLM provider calls | BSD-3-Clause |
| pytest | 8.3.4 | test suite | MIT |

## Frontend (`frontend/`)

| Package | Version | Used for | Licence |
| --- | --- | --- | --- |
| React | 18.3 | UI (no UI framework, no component library) | MIT |
| React DOM | 18.3 | renderer | MIT |
| react-router-dom | 6.28 | client routing | MIT |
| Vite | 6.0 | dev server and production build | MIT |
| TypeScript | 5.7 | type checking (`npm run typecheck` in CI) | Apache-2.0 |
| @vitejs/plugin-react | 4.3 | JSX transform | MIT |
| Fontsource packages (Geist, Space Grotesk, Instrument Serif, IBM Plex Mono) | 5.3 | self-hosted typefaces — no CDN, no Google Fonts request at runtime | OFL-1.1 |

Development-only tooling (not shipped): puppeteer-core + @sparticuz/chromium for the
screenshot/accessibility harness, jsdom + esbuild for `scripts/smoke.mjs`.

The interface itself is hand-written CSS (six stylesheets, design tokens in `src/styles/base.css`);
there is no Tailwind, no shadcn/ui, no icon package — icons are inline SVG path data in
`src/components/Icon.tsx`.

## Data / assets

| Item | Source | Notes |
| --- | --- | --- |
| `vendor/cit_public.json` | official Crunch Week starter pack | organisers' dataset, unmodified |
| `vendor/validator.py` | official Crunch Week starter pack | organisers' validator, unmodified, used read-only for verification |
| `vendor/sample_disruption.json`, `vendor/sample_requests.md` | official starter pack | unmodified |
| Fonts | system font stack | no external font licence |

We do **not** modify, wrap or re-license the organisers' files. `vendor/` is read-only in the repo and the validator is never imported by application logic - `api/app/core/constraints.py` is our own re-implementation, and `tools/selfcheck.py` + CI compare the two verdicts.
