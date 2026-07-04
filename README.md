# Fractured Archive Resolver

A conflict-aware archive for records that disagree. Users submit inconsistent
versions of a record family, GenLayer validators produce a structured
**archival map**, and the interface visualizes divergence, timeline,
reliability, and uncertainty — without erasing any meaningful version.

## What's here

| Path | What it is |
| --- | --- |
| `contracts/fractured_archive_resolver.py` | GenLayer intelligent contract: cases, versions, challenges, non-deterministic mapping with canonical-JSON strict-equality consensus, full map history, read methods. |
| `src/` | React + TypeScript frontend (Vite): landing, dashboard, create case, case room (versions / divergence map / timeline / consensus map / challenges / history), submit version, challenge room, public dossier view, settings. |
| `src/lib/store.ts` | Simulated GenLayer client — localStorage state + transaction lifecycle (preparing → wallet confirmation → submitted → awaiting finalization → finalized). |
| `src/lib/mapper.ts` | Simulated validator reasoning that generates a plausible archival map from submitted versions, so the full product flow works with no chain connection. |

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173. A demo case — **January DAO Grant Promise
Versions** — is pre-seeded with three conflicting versions and a generated
consensus map.

## MVP flow

1. Connect wallet (simulated) → Create archive case.
2. Submit at least two conflicting versions (content hash locks each one).
3. Request archival mapping → validators return a structured consensus map.
4. Explore the divergence map, timeline trace, and reliability panel.
5. Challenge a version, map, or divergence point → case becomes *challenged*.
6. Request remapping → a new map is generated; **the old map stays visible**.

## Design principles

- Contradiction is preserved, not resolved away.
- No true/false verdicts — archival treatments (`preserve_as_parallel`, …).
- Uncertainty is explicit: low / medium / high / irreducible.
- Maps are append-only; interpretive history is part of the archive.

## Connecting to real GenLayer

Deploy `contracts/fractured_archive_resolver.py` with GenLayer Studio, then
replace `src/lib/store.ts` with calls to `genlayer-js` (the read/write method
names in the contract match the store's function names one-to-one).
