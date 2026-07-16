# Fractured Archive Resolver

**A GenLayer-native archive for records that disagree.**

Fractured Archive Resolver lets communities, DAOs, researchers, journalists, and institutions preserve conflicting versions of a record family without forcing a single version to erase the rest. Users submit record versions and challenges; GenLayer validators fetch the underlying evidence, verify hashes, reason over the retrieved content, and settle a structured archival map on-chain.

> Built on [GenLayer](https://genlayer.com) on StudioNet (Chain ID `61999`)

---

## Current Deployment

- **StudioNet contract:** `0x4Eeca2BEe4E75748D1Fe7437ca9F578bAA09545D`
- **Contract file:** `contracts/fractured_archive_resolver.py`
- **Frontend:** React + Vite, configured through `VITE_GENLAYER_CONTRACT_ADDRESS`
- **Explorer:** [explorer.genlayer.com](https://explorer.genlayer.com)

The current deployment has been live-tested with two generated StudioNet wallets. The latest full test created a case, submitted two public records, requested mapping, filed a challenge with public evidence, requested remapping, and confirmed validator web retrieval plus SHA-256 verification for both submitted records and challenge evidence.

Final remap evidence result from the live test:

```text
map_status: partial_map
verified_version_count: 2
total_version_count: 2
failed_challenge_evidence_count: 0
sufficient_evidence: true
```

---

## What It Does

| Actor | What they do |
|-------|-------------|
| Archive creator | Opens a case for one disputed record family and defines its context |
| Version submitter | Submits a public `content_uri`, SHA-256 `content_hash`, source metadata, and claimed provenance |
| Challenger | Flags a version, map, or divergence point with public evidence and an evidence hash |
| GenLayer validators | Fetch records and challenge evidence, verify hashes, reason over retrieved content, and settle the archival map |

The heart of the project is `request_archival_mapping` and `request_remapping`. These are GenLayer non-deterministic write methods that use validator-side web access and `gl.eq_principle.prompt_non_comparative` to settle a structured map through GenLayer consensus.

This is not a normal deterministic EVM metadata registry. The contract is designed for GenLayer's AI-validator model: validators independently retrieve evidence, evaluate provenance, compare record meaning, and agree on a canonical result.

---

## Evidence Verification

The rejection concern this version fixes was:

> Validators never retrieve or hash-check the disputed records, so archival conclusions rely on submitter-authored metadata.

That is now fixed in the contract.

During mapping/remapping, the contract:

1. Reads all submitted versions for the case.
2. Fetches each `content_uri` through GenVM web access.
3. Computes SHA-256 for the fetched bytes.
4. Compares the computed hash against the submitted `content_hash`.
5. Fetches each challenge `evidence_uri`.
6. Computes and verifies the challenge evidence hash.
7. Includes fetched excerpts, computed hashes, HTTP status, byte length, and provenance notes in the validator context.
8. Stores an `evidence_verification` object inside the canonical map.
9. Forces `insufficient_evidence` when the evidence gate fails.

The map cannot quietly proceed from submitter-authored metadata alone. At least two submitted records must be validator-retrievable and hash-verified. Challenge evidence must also be retrievable and hash-verified for a remap to rely on it.

Example canonical map field:

```json
{
  "evidence_verification": {
    "verified_version_count": 2,
    "total_version_count": 2,
    "failed_challenge_evidence_count": 0,
    "sufficient_evidence": true,
    "notes": "Both submitted versions are validator-retrieved and hash-verified..."
  }
}
```

If verification fails, the contract deterministically downgrades the normalized output:

```text
map_status: insufficient_evidence
uncertainty_level: high
recommended_archive_treatment: requires_more_evidence
confidence: <= 35
```

---

## Contract

`contracts/fractured_archive_resolver.py`

A GenLayer Intelligent Contract written in Python with a pinned GenVM dependency header. It manages archive cases, submitted versions, challenges, audit logs, append-only map history, and AI-validator archival mapping.

### Key Methods

| Method | Role | Description |
|--------|------|-------------|
| `create_archive_case` | Creator | Open a case for one disputed record family |
| `submit_version` | Submitter | Lock a version into a case with URI, hash, source metadata, and claimed provenance |
| `challenge_version_or_map` | Anyone | Challenge a version, current map, or divergence point with public evidence |
| `request_archival_mapping` | Anyone | Trigger initial validator evidence retrieval, hash checking, and archival mapping |
| `request_remapping` | Anyone | Re-run evidence verification and mapping after a challenge or new versions |
| `close_case` | Creator only | Close a case to new submissions while keeping all records readable |
| `get_case` / `get_all_cases` | Anyone | Read case data |
| `get_versions` | Anyone | Read all versions for a case |
| `get_current_map` / `get_map_history` | Anyone | Read the current map or append-only map history |
| `get_challenges` | Anyone | Read challenges for a case |
| `get_divergence_points` | Anyone | Read divergence points from the latest map |
| `get_audit_trail` | Anyone | Read the immutable audit log for a case |

### Mapping Flow

```python
consensus_json = gl.eq_principle.prompt_non_comparative(
    build_evidence_context,
    task=(
        "Use validator-fetched content excerpts and validator-computed "
        "sha256 hashes, not submitter-authored metadata alone..."
    ),
    criteria=(
        "If fewer than two submitted records are retrievable and "
        "sha256-verified by validators, map_status must be insufficient_evidence..."
    ),
)
```

After the model returns JSON, the contract normalizes all enums, clamps confidence values, filters version IDs to actual submitted versions, normalizes `evidence_verification`, and applies a deterministic evidence gate. The post-processing guard means a too-optimistic model response cannot bypass failed retrieval or hash checks.

---

## Map Outcomes

Map statuses:

```text
resolved_map | partial_map | insufficient_evidence | contested_map | requires_more_versions
```

Uncertainty levels:

```text
low | medium | high | irreducible
```

Recommended archive treatments:

```text
preserve_as_primary | preserve_as_parallel | preserve_as_later_revision
preserve_as_translation_variant | preserve_as_disputed_memory
preserve_as_low_confidence | preserve_as_possible_tampering
exclude_from_current_map | requires_more_evidence
```

---

## Frontend

The frontend is a React 18 + TypeScript + Vite app using `genlayer-js` `1.1.8`.

It supports:

- Live StudioNet mode when `VITE_GENLAYER_CONTRACT_ADDRESS` is set.
- Simulated local mode when no contract address is configured.
- Injected EIP-1193 wallets such as MetaMask.
- Automatic StudioNet add/switch prompts.
- Case creation, version submission, mapping, challenge filing, remapping, close case.
- Current map, map history, divergence points, timeline, audit trail, public archive view.
- Evidence verification display on consensus maps.

The UI does not accept raw private keys. For live app use, import a test key into a wallet extension or use the injected wallet flow. For script-based tests, `genlayer-js` supports `createAccount(privateKey)`.

---

## Getting Started

### 1. Install

```bash
git clone https://github.com/Ifem1/Frachod.git
cd Frachod
npm install
```

### 2. Configure StudioNet

```env
VITE_GENLAYER_CONTRACT_ADDRESS=0x4Eeca2BEe4E75748D1Fe7437ca9F578bAA09545D
VITE_GENLAYER_CHAIN=studionet
```

### 3. Run Locally

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

### 4. Connect Wallet

Click **Connect Wallet**. The app uses the injected wallet provider and asks it to add or switch to StudioNet when needed.

---

## Routes

| Route | Description |
|-------|-------------|
| `/` | Landing page and project explanation |
| `/cases` | Archive case dashboard |
| `/create` | Create archive case |
| `/cases/[caseId]` | Case room with overview, versions, divergence graph, timeline, map, challenges, history |
| `/cases/[caseId]/submit` | Submit version |
| `/archive/[caseId]` | Public archive view |
| `/settings` | Wallet, network mode, and local cache controls |

---

## Critical Invariants

1. Archival mapping requires at least two submitted versions.
2. Each version must include a `content_hash`.
3. Mapping fetches each `content_uri` and verifies the fetched SHA-256 against `content_hash`.
4. Challenge evidence is fetched and SHA-256 checked against `evidence_hash`.
5. Failed retrieval, unsupported URI, HTTP error, missing challenge evidence, or hash mismatch is recorded in the evidence gate.
6. Failed evidence gates force `insufficient_evidence`.
7. Prior maps are never overwritten; remapping appends to history.
8. Challenging a version flags it but never deletes it.
9. Closing a case blocks new submissions but keeps records readable.
10. Every version ID in a returned map is checked against actual submitted versions.
11. LLM output is normalized before storage: enums checked, IDs filtered, confidence clamped, and evidence verification enforced.
12. The canonical map stores `evidence_verification` so users and reviewers can inspect what validators actually verified.

---

## Verification Status

Latest local checks:

```text
genvm-lint check contracts/fractured_archive_resolver.py --json
ok: true
contract: FracturedArchiveResolver
methods: 19
view_methods: 11
write_methods: 8
```

```text
npm.cmd run build
result: passed
```

Latest live StudioNet flow test:

```text
case_id: case-2
initial_map: map-2
remap: map-3
record retrieval: passed
record hash verification: passed
challenge evidence retrieval: passed
challenge evidence hash verification: passed
sufficient_evidence: true
```

The GenVM lint warning about a newer `py-genlayer` runner is informational. The contract intentionally keeps its pinned runner until a runner upgrade is explicitly chosen and retested.

---

## Stack

| Layer | Technology |
|-------|------------|
| Contract | GenLayer Intelligent Contract, Python, GenVM |
| Consensus | GenLayer AI-validator consensus with `prompt_non_comparative` |
| Frontend | React 18, TypeScript, Vite |
| SDK | `genlayer-js` 1.1.8 |
| Network | StudioNet, Chain ID `61999` |
| Wallet | Injected EIP-1193 provider, e.g. MetaMask |

---

## Design System

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

Fonts: **Cormorant Garamond** for display text, **Inter** for body/UI, and **IBM Plex Mono** for hashes and technical data.

---

## License

MIT
