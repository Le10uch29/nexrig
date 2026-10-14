# BuildAI

PC configurator with interactive 3D assembly, deterministic compatibility checks, FPS estimates, upgrade analysis and an AI hardware expert. UI language: Russian (strings in `lib/i18n/ru.ts`).

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · three.js / React Three Fiber / Drei · GSAP · Zustand · Zod · Vitest.

## Run

```bash
npm install
npm run dev          # http://localhost:3000 → /builder
npm test             # unit tests (compatibility, anchors/motion, benchmark engine, agents)
npm run typecheck
npm run lint
npm run build
```

Optional: copy `.env.example` to `.env.local` and set `ANTHROPIC_API_KEY` to enable live AI text in the AI Expert. Without it, a deterministic coordinator answers and the UI says live AI is unavailable.

## What is real and what is not

| Area | Status |
|---|---|
| Hardware data | **Local demo catalogue** in `components/PcComponents/` (~1000 items): GpuNvidia (GTX 1060 → RTX 5090), GpuAmd (RX 580 → RX 9070 XT), CpuIntel, CpuAmd, Ram (DDR3 → DDR5, per module), CpuCoolers, PcCase, MotherBoard (DDR3 → DDR5), Ssd, Hdd, PowerBlock (≥ 500 W), CaseFans. Chip/model specs are transcribed and unverified; partner GPU cards and RAM capacity × speed combinations are generated from line templates and flagged “≈ прибл.” with a note; motherboard slot/port counts come from chipset profiles. |
| Prices | **Demo figures** dated 2026-10-01. No live price source is connected. |
| FPS | **No measured data ships with the app.** Values are estimates from a relative-performance model (`lib/benchmark-engine`), labelled as estimates with ±25% range and low confidence. Users can add their own measurements; exact matches replace the estimate. |
| Compatibility | Deterministic rules (`features/compatibility/rules.ts`), 4 statuses: compatible / incompatible / requires verification / insufficient data. |
| 3D models | **Procedural placeholders** built from spec dimensions (`components/builder/scene/models.tsx`). No GLB assets are bundled. |
| Persistence | Browser `localStorage` (current build, saved builds, user measurements). `supabase/migrations/` holds a schema that is **not applied**. |
| AI | Specialist agents are local deterministic functions. With an API key, Claude (`claude-opus-5-5`, server-side refusal fallback enabled) only rewrites their output into prose. |

## Architecture

```
app/                      routes: builder, games, upgrade, expert, database, api/{agents,components}
components/
  builder/scene/          WebGL scene: PcScene, SlotRenderer (animation controller), models, bounds
  builder/                sidebar, inspector, catalog, timeline, saved builds, compare
  benchmarks/ compatibility/ hardware/ ai/ layout/ ui/
features/
  compatibility/          rules + engine (pure TS, tested)
  installation/           layout, named anchors, placements, motion profiles (pure TS, tested)
  build-state/            Zustand stores, derived selectors, install/conflict action
  benchmarks/             user measurement store
lib/
  hardware/               repository interface, power model, spec formatting
  benchmark-engine/       estimate model + measured-record lookup
  agents/                 specialists, coordinator, server-only LLM composer
  pricing/ validation/ i18n/
components/PcComponents/  hardware catalogue, one file per product group
features/catalog/         step-by-step facets (e.g. GPU → brand → line → series → model)
data/                     games (model parameters), default build
tests/                    vitest suites
supabase/migrations/      future database schema
```

### 3D installation pipeline

1. `features/installation/layout.ts` defines board layouts (ATX/mATX/ITX) and case geometry from specs.
2. `anchors.ts` resolves named anchors (`motherboard_mount`, `cpu_socket`, `ram_slot_N`, `gpu_slot`, `cpu_cooler_mount`, `ssd_slot_N`, `drive_bay_N`, `psu_bay`, `fan_N`, `radiator_mount`).
3. `placement.ts` decides per part: **mounted** at its anchor, or **parked** on the assembly bench (physical conflict or missing base part).
4. `motion.ts` turns a profile into keyframes: lift → travel → align over the slot → push in along the insertion axis, ending exactly on the anchor.
5. `SlotRenderer.tsx` plays keyframes with GSAP. Replacements animate removal first. Every timeline can be skipped (jumps to the end) or cancelled (restores the previous part). `prefers-reduced-motion` makes changes instant.

To swap in real models, render a GLB inside `ModelFor` keeping the local-origin convention documented on each procedural model.
