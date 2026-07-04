# Fractured Archive Resolver

**A GenLayer-native archive for records that disagree.**

Communities, DAOs, and institutions submit conflicting versions of a record — screenshots, forum posts, governance summaries, testimonies. GenLayer validators run non-deterministic AI comparison to reach consensus on an archival map: what agrees, what diverges, what came first, and how confident anyone can be. No version is erased to make room for another.

> Built on [GenLayer](https://genlayer.com) · StudioNet (Chain ID 61999)

---

## What it does

| Actor | What they do |
|-------|-------------|
| **Archive creator** | Opens a case for one disputed record family and defines its context |
| **Version submitter** | Locks a conflicting record into the case with a content hash and source metadata |
| **Challenger** | Flags a version, map, or divergence point as suspicious, wrong, or incomplete |
| **GenLayer Validators** | Independently compare submitted versions, reach consensus on a structured archival map |

The heart of Fractured Archive Resolver is `request_archival_mapping` / `request_remapping` — GenLayer non-deterministic methods that run an archival-reasoning prompt on every validator node and reach consensus with `gl.eq_principle.prompt_non_comparative`. No human admin decides which version is "true."

---

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite |
| Contract | GenLayer Intelligent Contract (Python) |
| Network | StudioNet — Chain ID 61999 |
| SDK | `genlayer-js` 1.1.8 |
| Wallet | MetaMask / injected EIP-1193 wallet — connects directly, no burner key, no snap install |

---

## Live deployment

- **Contract:** deployed on StudioNet at `0x5B9Ab68F06A149E8183C80028A7E1c74031bA498`
- **Explorer:** [explorer.genlayer.com](https://explorer.genlayer.com)
- **Frontend:** run locally per [Getting started](#getting-started) below

---

## Contract: FracturedArchiveResolver

`contracts/fractured_archive_resolver.py`

A GenLayer Intelligent Contract written in Python. Manages archive cases, version submissions, challenges, and AI-powered archival-map resolution.

### Key methods

| Method | Role | Description |
|--------|------|-------------|
| `create_archive_case` | Creator | Open a case for one disputed record family |
| `submit_version` | Submitter | Lock a version into the case with a content hash |
| `challenge_version_or_map` | Anyone | Challenge a version, the current map, or a divergence point |
| `request_archival_mapping` | Anyone | **Trigger GenLayer non-deterministic archival comparison** |
| `request_remapping` | Anyone | Re-run mapping after a challenge or new evidence — old maps are never deleted |
| `close_case` | Creator only | Close a case to new submissions; records stay readable |
| `get_case` / `get_all_cases` | Anyone | Read case data |
| `get_versions` | Anyone | Read all versions for a case |
| `get_current_map` / `get_map_history` | Anyone | Read the current or full history of archival maps |
| `get_challenges` / `get_divergence_points` | Anyone | Read challenges and the latest map's divergence points |
| `get_audit_trail` | Anyone | Read the immutable on-chain event log for a case |

### Non-deterministic archival mapping

`request_archival_mapping` / `request_remapping` are the GenLayer-native core of the protocol:

```python
# Leader generates the archival map from submitted versions + challenges
consensus_json = gl.eq_principle.prompt_non_comparative(
    lambda: context,
    task="You are an archival reasoning agent... Compare the submitted "
         "versions... Identify agreement zones, divergence points, likely "
         "timeline, source reliability... Preserve contradictions where "
         "they remain meaningful or unresolved...",
    criteria="map_status must be exactly one of: resolved_map, partial_map, "
             "insufficient_evidence, contested_map, requires_more_versions. "
             "The map must not erase or dismiss any submitted version "
             "without stated evidence...",
)
```

The output is canonicalized — enum values validated, confidence clamped 0–100, version IDs checked against submitted IDs — before being stored, so validators can reach consensus on an inherently non-deterministic task.

### Map statuses

```
resolved_map | partial_map | insufficient_evidence | contested_map | requires_more_versions
```

### Uncertainty levels

```
low | medium | high | irreducible
```

### Recommended archive treatments

```
preserve_as_primary | preserve_as_parallel | preserve_as_later_revision
preserve_as_translation_variant | preserve_as_disputed_memory | preserve_as_low_confidence
preserve_as_possible_tampering | exclude_from_current_map | requires_more_evidence
```

---

## Getting started

### 1. Clone and install

```bash
git clone https://github.com/Ifem1/Frachod.git
cd Frachod
npm install
```

### 2. Deploy the contract

Open `contracts/fractured_archive_resolver.py` in [GenLayer Studio](https://studio.genlayer.com), deploy to StudioNet, and copy the contract address. (Or reuse the address already deployed above.)

### 3. Set the contract address

```env
# .env
VITE_GENLAYER_CONTRACT_ADDRESS=0xYourDeployedContractAddress
VITE_GENLAYER_CHAIN=studionet
```

### 4. Run the frontend

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

### 5. Connect your wallet

Click **Connect Wallet**. The app requests access from your injected wallet (e.g. MetaMask) and automatically adds/switches it to StudioNet on your first transaction — no manual network setup required.

Without a contract address set, the app runs entirely in a **simulated mode**: a fake wallet, a heuristic map generator, and a pre-seeded demo case ("January DAO Grant Promise Versions"), so the UI can be exercised with no chain connection at all.

---

## Pages

| Route | Description |
|-------|-------------|
| `/` | Landing — concept, how GenLayer maps conflict, example scenario |
| `/cases` | Archive Cases dashboard — search and filter by status, type, uncertainty |
| `/create` | Create Archive Case |
| `/cases/[caseId]` | Case room — Overview, Versions, Divergence Map, Timeline, Consensus Map, Challenges, History |
| `/cases/[caseId]/submit` | Submit Version |
| `/archive/[caseId]` | Public dossier view — shareable, no wallet clutter |
| `/settings` | Wallet, network mode, and local cache controls |

---

## Critical invariants

1. Archival mapping requires at least two submitted versions.
2. A content hash locks each version; a duplicate hash in the same case requires a metadata explanation.
3. Only the case creator can close a case.
4. Closing a case never deletes records — closed cases remain readable.
5. Prior archival maps are never overwritten. Remapping appends a new map; every previous map stays in `get_map_history`.
6. Challenging a version flags it — it is never removed from the archive.
7. Every version ID referenced in a returned map is validated against the case's actual submitted versions before being stored.
8. Non-deterministic model output is canonicalized (enum-checked, confidence clamped 0–100, sorted keys) so validators can reach strict-equality consensus on an inherently fuzzy task.

---

## Design system: Archive Room

| Token | Value |
|-------|-------|
| Deep Archive Ink | `#111827` |
| Faded Paper | `#F4EFE6` |
| Bone White | `#FBF8F1` |
| Oxidized Copper | `#A66A3F` |
| Dust Grey | `#8B8A84` |
| Evidence Blue | `#3B82F6` |
| Warning Amber | `#D89A21` |
| Fracture Red | `#B4473A` |
| Archive Green | `#3F6B57` |
| Charcoal Line | `#252A31` |

Fonts: **Cormorant Garamond** (display/titles) · **Inter** (body/UI) · **IBM Plex Mono** (hashes, version IDs, technical data)

---

## License

MIT
