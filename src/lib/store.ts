// Simulated GenLayer contract client. State is persisted in localStorage and
// mutations mimic on-chain transaction lifecycles (preparing → wallet
// confirmation → submitted → awaiting finalization → finalized).

import { useSyncExternalStore } from "react";
import type {
  ArchiveCase,
  ArchiveVersion,
  ArchivalMap,
  Challenge,
  HistoryEvent,
  TxState,
  ArchiveType,
  SourceType,
  ChallengeTargetType,
  ChallengeReason,
} from "../types";
import { generateArchivalMap, uid, fakeHash } from "./mapper";
import {
  isLiveMode,
  connectInjectedWallet,
  tryRestoreInjectedWallet,
  disconnectInjectedWallet,
  reads as chainReads,
  writes as chainWrites,
  waitFinalized,
} from "./genlayer";
import type { Hash } from "genlayer-js/types";

export interface AppState {
  wallet: string | null;
  cases: ArchiveCase[];
  versions: ArchiveVersion[];
  maps: ArchivalMap[];
  challenges: Challenge[];
  history: HistoryEvent[];
}

const STORAGE_KEY = "fractured-archive-resolver-v1";
const LIVE_STORAGE_KEY = "fractured-archive-resolver-live-v1";

let state: AppState = load();
const listeners = new Set<() => void>();

function emptyState(): AppState {
  return { wallet: null, cases: [], versions: [], maps: [], challenges: [], history: [] };
}

function load(): AppState {
  // Live mode never seeds the fictional demo case — it starts empty and is
  // hydrated from the deployed contract via refreshAllCases()/refreshCaseDetail().
  if (isLiveMode()) {
    try {
      const raw = localStorage.getItem(LIVE_STORAGE_KEY);
      if (raw) return JSON.parse(raw) as AppState;
    } catch {
      /* fresh start */
    }
    return emptyState();
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as AppState;
  } catch {
    /* fresh start */
  }
  return seed();
}

function persist() {
  localStorage.setItem(isLiveMode() ? LIVE_STORAGE_KEY : STORAGE_KEY, JSON.stringify(state));
}

function emit() {
  persist();
  listeners.forEach((l) => l());
}

function set(updater: (s: AppState) => AppState) {
  state = updater(state);
  emit();
}

export function useAppState(): AppState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state
  );
}

// ---------------- wallet ----------------
// Live mode connects the user's own injected wallet (e.g. MetaMask) directly
// — no burner key, no snap install. Simulated mode fakes an address so the
// UI can still be exercised without a wallet extension.

export async function connectWallet(): Promise<string> {
  if (isLiveMode()) {
    const addr = await connectInjectedWallet();
    set((s) => ({ ...s, wallet: addr }));
    return addr;
  }
  const addr =
    state.wallet ??
    "0x" +
      Array.from(crypto.getRandomValues(new Uint8Array(20)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
  set((s) => ({ ...s, wallet: addr }));
  return addr;
}

// Called once on app load to silently pick up an already-authorized wallet
// connection (no popup), so the user doesn't have to reconnect every visit.
export async function restoreWalletIfAuthorized(): Promise<void> {
  if (!isLiveMode()) return;
  // Always re-establish the actual signer connection on load, even if a
  // wallet address was cached from a previous session — a cached address
  // string alone doesn't mean genlayer.ts has a live client bound to it,
  // and writes would fail with "wallet not connected" until the user
  // manually disconnected and reconnected.
  const addr = await tryRestoreInjectedWallet();
  set((s) => ({ ...s, wallet: addr }));
}

export function disconnectWallet() {
  if (isLiveMode()) disconnectInjectedWallet();
  set((s) => ({ ...s, wallet: null }));
}

// ---------------- live chain hydration ----------------
// Components call these on mount to pull authoritative state from the
// deployed FracturedArchiveResolver contract when running in live mode.
// In simulated mode they are no-ops (state already lives in localStorage).

export async function refreshAllCases(): Promise<void> {
  if (!isLiveMode()) return;
  const cases = await chainReads.getAllCases();
  set((s) => ({ ...s, cases: mergeById(s.cases, cases, (c) => c.caseId) }));
}

export async function refreshCaseDetail(caseId: string): Promise<void> {
  if (!isLiveMode()) return;
  const [versions, maps, challenges, history] = await Promise.all([
    chainReads.getVersions(caseId),
    chainReads.getMapHistory(caseId),
    chainReads.getChallenges(caseId),
    chainReads.getAuditTrail(caseId),
  ]);
  let caseRecord: ArchiveCase | undefined;
  try {
    caseRecord = await chainReads.getCase(caseId);
  } catch {
    caseRecord = undefined;
  }
  set((s) => ({
    ...s,
    cases: caseRecord ? mergeById(s.cases, [caseRecord], (c) => c.caseId) : s.cases,
    versions: mergeById(
      s.versions.filter((v) => v.caseId !== caseId),
      versions,
      (v) => v.versionId
    ),
    maps: [...s.maps.filter((m) => m.caseId !== caseId), ...maps],
    challenges: mergeById(
      s.challenges.filter((c) => c.caseId !== caseId),
      challenges,
      (c) => c.challengeId
    ),
    history: mergeById(
      s.history.filter((h) => h.caseId !== caseId),
      history,
      (h) => h.eventId
    ),
  }));
}

function mergeById<T>(existing: T[], incoming: T[], key: (item: T) => string): T[] {
  const byId = new Map(existing.map((item) => [key(item), item]));
  for (const item of incoming) byId.set(key(item), item);
  return Array.from(byId.values());
}

// ---------------- tx simulation ----------------

export interface TxHandle {
  state: TxState;
  txHash?: string;
  error?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function runTx(
  onState: (t: TxHandle) => void,
  apply: (txHash: string) => void
): Promise<TxHandle> {
  const txHash =
    "0x" +
    Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  onState({ state: "preparing" });
  await sleep(500);
  onState({ state: "wallet_confirmation" });
  await sleep(900);
  onState({ state: "submitted", txHash });
  await sleep(700);
  onState({ state: "awaiting_finalization", txHash });
  await sleep(1100);
  apply(txHash);
  const done: TxHandle = { state: "finalized", txHash };
  onState(done);
  return done;
}

function record(caseId: string, kind: HistoryEvent["kind"], summary: string, actor: string, txHash: string) {
  const ev: HistoryEvent = { eventId: uid("ev"), caseId, kind, summary, actor, at: Date.now(), txHash };
  state = { ...state, history: [...state.history, ev] };
}

// Drives the same five-state tx UI as the simulation, but backed by a real
// GenLayer transaction: submit() gives us a hash quickly, then we wait for
// consensus finalization before resolving.
async function runLiveTx(
  onState: (t: TxHandle) => void,
  submitFn: () => Promise<Hash>
): Promise<TxHandle> {
  onState({ state: "preparing" });
  await new Promise((r) => setTimeout(r, 200));
  onState({ state: "wallet_confirmation" });
  const hash = await submitFn();
  onState({ state: "submitted", txHash: hash });
  onState({ state: "awaiting_finalization", txHash: hash });
  await waitFinalized(hash);
  const done: TxHandle = { state: "finalized", txHash: hash };
  onState(done);
  return done;
}

// ---------------- contract methods ----------------

export interface CreateCaseInput {
  title: string;
  description: string;
  fullContext: string;
  archiveType: ArchiveType;
  caseContextUri: string;
  tags: string[];
  visibility: "public" | "unlisted";
}

export async function createArchiveCase(
  input: CreateCaseInput,
  onState: (t: TxHandle) => void
): Promise<string> {
  if (!state.wallet) throw new Error("Wallet not connected");
  if (!input.title.trim()) throw new Error("Title must not be empty");

  if (isLiveMode()) {
    // The deployed contract only stores title/description/archive_type/
    // case_context_uri; fold fullContext into description so it isn't lost,
    // and keep tags/visibility as local-only decoration (contract has no
    // fields for them).
    const description = input.fullContext.trim()
      ? `${input.description.trim()}\n\n${input.fullContext.trim()}`
      : input.description.trim();
    await runLiveTx(onState, () =>
      chainWrites.createArchiveCase(input.title.trim(), description, input.archiveType, input.caseContextUri.trim())
    );
    await refreshAllCases();
    const newestOwn = state.cases
      .filter((c) => c.creator.toLowerCase() === state.wallet!.toLowerCase())
      .sort((a, b) => b.createdAt - a.createdAt)[0];
    if (!newestOwn) throw new Error("Case was created but could not be found after refresh");
    return newestOwn.caseId;
  }

  const caseId = uid("case");
  await runTx(onState, (txHash) => {
    const c: ArchiveCase = {
      caseId,
      title: input.title.trim(),
      description: input.description.trim(),
      fullContext: input.fullContext.trim(),
      archiveType: input.archiveType,
      creator: state.wallet!,
      createdAt: Date.now(),
      status: "open",
      caseContextUri: input.caseContextUri.trim(),
      tags: input.tags,
      visibility: input.visibility,
      versionCount: 0,
    };
    state = { ...state, cases: [...state.cases, c] };
    record(caseId, "case_created", `Archive case "${c.title}" created.`, state.wallet!, txHash);
    emit();
  });
  return caseId;
}

export interface SubmitVersionInput {
  caseId: string;
  title: string;
  versionLabel: string;
  contentUri: string;
  contentHash: string;
  sourceUri: string;
  sourceType: SourceType;
  claimedAuthor: string;
  claimedDate: string;
  language: string;
  metadataUri: string;
  notes: string;
}

export async function submitVersion(
  input: SubmitVersionInput,
  onState: (t: TxHandle) => void
): Promise<string> {
  if (!state.wallet) throw new Error("Wallet not connected");
  const c = state.cases.find((x) => x.caseId === input.caseId);
  if (!c) throw new Error("Case does not exist");
  if (c.status === "closed") throw new Error("Case is closed to new submissions");
  const dup = state.versions.find(
    (v) => v.caseId === input.caseId && v.contentHash && v.contentHash === input.contentHash.trim()
  );
  if (dup && !input.notes.trim()) {
    throw new Error(
      "This content hash already exists in the case. Add a note explaining why a duplicate hash is being submitted."
    );
  }
  const contentHash =
    input.contentHash.trim() || (await fakeHash(input.title + input.contentUri + Date.now()));

  if (isLiveMode()) {
    // The contract has no "notes" field; it is a frontend-only annotation
    // used for the duplicate-hash justification and is not persisted on-chain.
    await runLiveTx(onState, () =>
      chainWrites.submitVersion({
        caseId: input.caseId,
        title: input.title.trim(),
        versionLabel: input.versionLabel.trim(),
        contentUri: input.contentUri.trim(),
        contentHash,
        sourceUri: input.sourceUri.trim(),
        sourceType: input.sourceType,
        claimedAuthor: input.claimedAuthor.trim(),
        claimedDate: input.claimedDate.trim(),
        language: input.language.trim(),
        metadataUri: input.metadataUri.trim(),
      })
    );
    await refreshCaseDetail(input.caseId);
    const newestOwn = state.versions
      .filter((v) => v.caseId === input.caseId && v.submitter.toLowerCase() === state.wallet!.toLowerCase())
      .sort((a, b) => b.submittedAt - a.submittedAt)[0];
    if (!newestOwn) throw new Error("Version was submitted but could not be found after refresh");
    return newestOwn.versionId;
  }

  const versionId = uid("ver");
  await runTx(onState, (txHash) => {
    const v: ArchiveVersion = {
      versionId,
      caseId: input.caseId,
      submitter: state.wallet!,
      title: input.title.trim(),
      versionLabel: input.versionLabel.trim() || `Version ${c.versionCount + 1}`,
      contentUri: input.contentUri.trim(),
      contentHash,
      sourceUri: input.sourceUri.trim(),
      sourceType: input.sourceType,
      claimedAuthor: input.claimedAuthor.trim(),
      claimedDate: input.claimedDate.trim(),
      submittedAt: Date.now(),
      language: input.language.trim(),
      metadataUri: input.metadataUri.trim(),
      notes: input.notes.trim(),
      status: "submitted",
    };
    state = {
      ...state,
      versions: [...state.versions, v],
      cases: state.cases.map((x) =>
        x.caseId === input.caseId ? { ...x, versionCount: x.versionCount + 1 } : x
      ),
    };
    record(
      input.caseId,
      "version_submitted",
      `Version "${v.versionLabel}" locked into the archive record.`,
      state.wallet!,
      txHash
    );
    emit();
  });
  return versionId;
}

export async function requestArchivalMapping(
  caseId: string,
  onState: (t: TxHandle) => void
): Promise<void> {
  if (!state.wallet) throw new Error("Wallet not connected");
  const c = state.cases.find((x) => x.caseId === caseId);
  if (!c) throw new Error("Case does not exist");
  const versions = state.versions.filter((v) => v.caseId === caseId);
  if (versions.length < 2) throw new Error("At least two versions are required before mapping");

  if (isLiveMode()) {
    // request_archival_mapping runs the non-deterministic validator prompt
    // synchronously on-chain, so the write only finalizes once the map
    // exists; no extra polling delay is needed afterward.
    await runLiveTx(onState, () => chainWrites.requestArchivalMapping(caseId));
    await refreshCaseDetail(caseId);
    return;
  }

  await runTx(onState, (txHash) => {
    state = {
      ...state,
      cases: state.cases.map((x) => (x.caseId === caseId ? { ...x, status: "mapping_requested" } : x)),
    };
    record(caseId, "mapping_requested", "Archival mapping requested from GenLayer validators.", state.wallet!, txHash);
    emit();
  });

  // Simulated validator deliberation window.
  await sleep(1600);
  finalizeMap(caseId, false);
}

export async function requestRemapping(caseId: string, onState: (t: TxHandle) => void): Promise<void> {
  if (!state.wallet) throw new Error("Wallet not connected");
  const c = state.cases.find((x) => x.caseId === caseId);
  if (!c) throw new Error("Case does not exist");
  const priorMap = state.maps.some((m) => m.caseId === caseId);
  if (!priorMap) throw new Error("No prior map exists; request an initial mapping instead");

  if (isLiveMode()) {
    await runLiveTx(onState, () => chainWrites.requestRemapping(caseId));
    await refreshCaseDetail(caseId);
    return;
  }

  await runTx(onState, (txHash) => {
    state = {
      ...state,
      cases: state.cases.map((x) =>
        x.caseId === caseId ? { ...x, status: "remapping_requested" } : x
      ),
    };
    record(
      caseId,
      "remapping_requested",
      "Remapping requested. The previous map remains visible for historical continuity.",
      state.wallet!,
      txHash
    );
    emit();
  });

  await sleep(1600);
  finalizeMap(caseId, state.challenges.some((ch) => ch.caseId === caseId));
}

function finalizeMap(caseId: string, contested: boolean) {
  const c = state.cases.find((x) => x.caseId === caseId);
  if (!c) return;
  const versions = state.versions.filter((v) => v.caseId === caseId);
  const flagged = new Set(
    state.challenges
      .filter((ch) => ch.caseId === caseId && ch.targetType === "version")
      .map((ch) => ch.targetId)
  );
  const map = generateArchivalMap(c, versions, flagged, contested);
  state = {
    ...state,
    maps: [...state.maps, map],
    cases: state.cases.map((x) =>
      x.caseId === caseId ? { ...x, status: "mapped", latestMapId: map.mapId } : x
    ),
    versions: state.versions.map((v) =>
      v.caseId === caseId
        ? { ...v, status: flagged.has(v.versionId) ? "flagged" : "included_in_map" }
        : v
    ),
  };
  record(
    caseId,
    "map_generated",
    `GenLayer consensus map generated (${map.mapStatus.replace(/_/g, " ")}, uncertainty ${map.uncertaintyLevel}).`,
    "genlayer_validators",
    "0x" + map.mapId
  );
  emit();
}

export interface ChallengeInput {
  caseId: string;
  targetType: ChallengeTargetType;
  targetId: string;
  challengeReason: ChallengeReason;
  explanation: string;
  evidenceUri: string;
  evidenceHash: string;
}

export async function challengeVersionOrMap(
  input: ChallengeInput,
  onState: (t: TxHandle) => void
): Promise<void> {
  if (!state.wallet) throw new Error("Wallet not connected");
  const c = state.cases.find((x) => x.caseId === input.caseId);
  if (!c) throw new Error("Case does not exist");

  if (isLiveMode()) {
    await runLiveTx(onState, () =>
      chainWrites.challengeVersionOrMap({
        caseId: input.caseId,
        targetType: input.targetType,
        targetId: input.targetId,
        challengeReason: input.challengeReason,
        explanation: input.explanation.trim(),
        evidenceUri: input.evidenceUri.trim(),
        evidenceHash: input.evidenceHash.trim(),
      })
    );
    await refreshCaseDetail(input.caseId);
    return;
  }

  await runTx(onState, (txHash) => {
    const ch: Challenge = {
      challengeId: uid("chal"),
      caseId: input.caseId,
      challenger: state.wallet!,
      targetType: input.targetType,
      targetId: input.targetId,
      challengeReason: input.challengeReason,
      explanation: input.explanation.trim(),
      evidenceUri: input.evidenceUri.trim(),
      evidenceHash: input.evidenceHash.trim(),
      createdAt: Date.now(),
    };
    state = {
      ...state,
      challenges: [...state.challenges, ch],
      cases: state.cases.map((x) => (x.caseId === input.caseId ? { ...x, status: "challenged" } : x)),
      versions:
        input.targetType === "version"
          ? state.versions.map((v) =>
              v.versionId === input.targetId ? { ...v, status: "flagged" } : v
            )
          : state.versions,
    };
    record(
      input.caseId,
      "challenge_filed",
      `Challenge filed against ${input.targetType.replace(/_/g, " ")} (${input.challengeReason.replace(/_/g, " ")}).`,
      state.wallet!,
      txHash
    );
    emit();
  });
}

export async function closeCase(caseId: string, onState: (t: TxHandle) => void): Promise<void> {
  if (!state.wallet) throw new Error("Wallet not connected");
  const c = state.cases.find((x) => x.caseId === caseId);
  if (!c) throw new Error("Case does not exist");
  if (c.creator.toLowerCase() !== state.wallet.toLowerCase())
    throw new Error("Only the case creator can close this case");

  if (isLiveMode()) {
    await runLiveTx(onState, () => chainWrites.closeCase(caseId));
    await refreshCaseDetail(caseId);
    return;
  }

  await runTx(onState, (txHash) => {
    state = {
      ...state,
      cases: state.cases.map((x) => (x.caseId === caseId ? { ...x, status: "closed" } : x)),
    };
    record(caseId, "case_closed", "Case closed to new submissions. Records remain readable.", state.wallet!, txHash);
    emit();
  });
}

export function resetDemo() {
  state = isLiveMode() ? emptyState() : seed();
  emit();
  if (isLiveMode()) refreshAllCases();
}

// ---------------- demo seed ----------------

function seed(): AppState {
  const now = Date.now();
  const day = 86400000;
  const creator = "0xA1c3d5E7f9B2a4C6d8E0f1A3b5C7d9E1f3A5b7C9";
  const caseId = "case_demo_jan_grant";

  const demoCase: ArchiveCase = {
    caseId,
    title: "January DAO Grant Promise Versions",
    description:
      "Multiple versions of a DAO announcement disagree about whether a grant was guaranteed or discretionary.",
    fullContext:
      "In January the DAO published an announcement about builder grants. The original post was later edited, and a March governance summary describes the promise differently. Three records now exist and community members disagree about what was actually promised.",
    archiveType: "governance_record",
    creator,
    createdAt: now - 20 * day,
    status: "open",
    caseContextUri: "ipfs://bafy.../january-grant-context.json",
    tags: ["dao", "grants", "governance", "edited-announcement"],
    visibility: "public",
    versionCount: 3,
  };

  const versions: ArchiveVersion[] = [
    {
      versionId: "ver_demo_a",
      caseId,
      submitter: creator,
      title: "Original screenshot says approved builders will receive guaranteed milestone grants.",
      versionLabel: "Version A — Original screenshot",
      contentUri: "ipfs://bafy.../screenshot-jan-05.png",
      contentHash: "0x8f2ab1c3d4e5f60718293a4b5c6d7e8f9012a3b4c5d6e7f8091a2b3c4d5e6f70",
      sourceUri: "https://forum.exampledao.org/t/builder-grants/412",
      sourceType: "screenshot",
      claimedAuthor: "ExampleDAO Core Team",
      claimedDate: "2026-01-05",
      submittedAt: now - 19 * day,
      language: "en",
      metadataUri: "ipfs://bafy.../screenshot-meta.json",
      notes: "Screenshot captured by a community member before the forum post was edited. States grants are guaranteed.",
      status: "submitted",
    },
    {
      versionId: "ver_demo_b",
      caseId,
      submitter: "0xB2d4E6f8A0c1B3d5E7f9A1b3C5d7E9f1A3b5C7d9",
      title: "Edited forum post says approved builders may receive discretionary support.",
      versionLabel: "Version B — Edited forum post",
      contentUri: "https://forum.exampledao.org/t/builder-grants/412",
      contentHash: "0x1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f70818f9e0d1c2b3a4958",
      sourceUri: "https://forum.exampledao.org/t/builder-grants/412",
      sourceType: "public_webpage",
      claimedAuthor: "ExampleDAO Core Team",
      claimedDate: "2026-02-10",
      submittedAt: now - 15 * day,
      language: "en",
      metadataUri: "",
      notes: "Current live version of the post. Edit history badge visible; grants described as discretionary and 'may' be provided.",
      status: "submitted",
    },
    {
      versionId: "ver_demo_c",
      caseId,
      submitter: "0xC3e5F7a9B1d2C4e6F8a0B2c4D6e8F0a2B4c6D8e0",
      title: "Governance summary says no grant guarantee was ever made.",
      versionLabel: "Version C — Governance summary",
      contentUri: "ipfs://bafy.../gov-summary-march.pdf",
      contentHash: "0x9e8d7c6b5a4938271605f4e3d2c1b0a9988776655443322110ffeeddccbbaa00",
      sourceUri: "https://gov.exampledao.org/summaries/2026-q1",
      sourceType: "institutional_file",
      claimedAuthor: "Governance Working Group",
      claimedDate: "2026-03-02",
      submittedAt: now - 10 * day,
      language: "en",
      metadataUri: "ipfs://bafy.../gov-summary-meta.json",
      notes: "Quarterly summary states that no guarantee was made and support was always discretionary.",
      status: "submitted",
    },
  ];

  const history: HistoryEvent[] = [
    {
      eventId: "ev_demo_1",
      caseId,
      kind: "case_created",
      summary: 'Archive case "January DAO Grant Promise Versions" created.',
      actor: creator,
      at: demoCase.createdAt,
      txHash: "0xdemo1",
    },
    ...versions.map((v, i) => ({
      eventId: `ev_demo_v${i}`,
      caseId,
      kind: "version_submitted" as const,
      summary: `Version "${v.versionLabel}" locked into the archive record.`,
      actor: v.submitter,
      at: v.submittedAt,
      txHash: `0xdemov${i}`,
    })),
  ];

  const base: AppState = {
    wallet: null,
    cases: [demoCase],
    versions,
    maps: [],
    challenges: [],
    history,
  };

  // Pre-generate a demo map so the explore experience is complete.
  const map = generateArchivalMap(demoCase, versions, new Set(), false);
  map.generatedAt = now - 8 * day;
  base.maps = [map];
  base.cases = [{ ...demoCase, status: "mapped", latestMapId: map.mapId }];
  base.versions = versions.map((v) => ({ ...v, status: "included_in_map" }));
  base.history.push({
    eventId: "ev_demo_map",
    caseId,
    kind: "map_generated",
    summary: `GenLayer consensus map generated (${map.mapStatus.replace(/_/g, " ")}, uncertainty ${map.uncertaintyLevel}).`,
    actor: "genlayer_validators",
    at: map.generatedAt,
    txHash: "0xdemomap",
  });

  return base;
}
