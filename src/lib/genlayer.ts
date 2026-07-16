// Real GenLayer client (genlayer-js 1.1.8) for the FracturedArchiveResolver
// intelligent contract deployed at CONTRACT_ADDRESS, matching
// contracts/fractured_archive_resolver.py.
//
// src/lib/store.ts calls into this module whenever isLiveMode() is true
// (i.e. VITE_GENLAYER_CONTRACT_ADDRESS is set in .env). Otherwise it falls
// back to a localStorage simulation so the UI can still be exercised without
// a deployed contract or funded account.

import { createClient } from "genlayer-js";
import { studionet, localnet, testnetAsimov } from "genlayer-js/chains";
import type { GenLayerClient, TransactionStatus, CalldataEncodable, Hash } from "genlayer-js/types";
import type {
  ArchiveCase,
  ArchiveVersion,
  ArchivalMap,
  Challenge,
  HistoryEvent,
  TimelineStep,
  AgreementZone,
  DivergencePoint,
  VersionReliability,
} from "../types";

export const CONTRACT_ADDRESS = (import.meta.env.VITE_GENLAYER_CONTRACT_ADDRESS ??
  "") as `0x${string}`;

const CHAINS = { localnet, studionet, testnetAsimov } as const;
const chainName = (import.meta.env.VITE_GENLAYER_CHAIN ?? "studionet") as keyof typeof CHAINS;

export const isLiveMode = (): boolean => CONTRACT_ADDRESS.length === 42;

// ---------------- injected wallet (MetaMask / any EIP-1193 provider) ----------------
// createClient() delegates eth_accounts / eth_requestAccounts / eth_sendTransaction /
// personal_sign / eth_signTypedData_v4 straight to window.ethereum whenever
// its `account` option is a plain address string rather than a local signer
// object, so the user's own injected wallet does the signing — no burner
// key, no snap install step.

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on?: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
    };
  }
}

const ADDRESS_STORAGE_KEY = "fractured-archive-resolver-connected-address";

function getInjectedProvider(): NonNullable<Window["ethereum"]> {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("No injected wallet found. Install and unlock a wallet extension (e.g. MetaMask) to continue.");
  }
  return window.ethereum;
}

const selectedChain = CHAINS[chainName] ?? studionet;

let client: GenLayerClient<any> | null = null;
let connectedAddress: `0x${string}` | null = null;

function buildClient(account?: `0x${string}`): GenLayerClient<any> {
  return createClient({
    chain: selectedChain,
    ...(account ? { account } : {}),
  }) as GenLayerClient<any>;
}

/** Reads never require a signer, so this works even before a wallet is connected. */
export function getReadClient(): GenLayerClient<any> {
  if (!client) client = buildClient(connectedAddress ?? undefined);
  return client;
}

// Points the injected wallet at the GenLayer network (adding it if the user
// has never used it before) via the standard EIP-3085/3326 RPC methods —
// no GenLayer snap involved, just a network add/switch like any dApp does.
async function ensureCorrectChain(provider: NonNullable<Window["ethereum"]>): Promise<void> {
  const chainIdHex = `0x${selectedChain.id.toString(16)}`;
  const currentChainId = (await provider.request({ method: "eth_chainId" })) as string;
  if (currentChainId?.toLowerCase() === chainIdHex.toLowerCase()) return;

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainIdHex }],
    });
  } catch (switchError) {
    const code = (switchError as { code?: number } | null)?.code;
    if (code !== 4902) throw switchError;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: chainIdHex,
          chainName: selectedChain.name,
          rpcUrls: selectedChain.rpcUrls.default.http,
          nativeCurrency: selectedChain.nativeCurrency,
          blockExplorerUrls: selectedChain.blockExplorers
            ? [selectedChain.blockExplorers.default.url]
            : undefined,
        },
      ],
    });
  }
}

/** Prompts the injected wallet for account access and binds it as the signer for writes. */
export async function connectInjectedWallet(): Promise<`0x${string}`> {
  const provider = getInjectedProvider();
  const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
  const address = accounts[0] as `0x${string}` | undefined;
  if (!address) throw new Error("Wallet did not return an account.");
  await ensureCorrectChain(provider);
  connectedAddress = address;
  localStorage.setItem(ADDRESS_STORAGE_KEY, address);
  client = buildClient(address);
  return address;
}

/** Silently recovers a previously-authorized connection (no popup) on page load. */
export async function tryRestoreInjectedWallet(): Promise<`0x${string}` | null> {
  if (typeof window === "undefined" || !window.ethereum) return null;
  try {
    const accounts = (await window.ethereum.request({ method: "eth_accounts" })) as string[];
    const address = accounts[0] as `0x${string}` | undefined;
    if (!address) return null;
    connectedAddress = address;
    localStorage.setItem(ADDRESS_STORAGE_KEY, address);
    client = buildClient(address);
    return address;
  } catch {
    return null;
  }
}

export function getConnectedAddress(): `0x${string}` | null {
  return connectedAddress;
}

/** Forgets the local "connected" flag. Does not revoke the wallet's own site permission. */
export function disconnectInjectedWallet(): void {
  connectedAddress = null;
  localStorage.removeItem(ADDRESS_STORAGE_KEY);
  client = buildClient();
}

async function requireWriteClient(): Promise<GenLayerClient<any>> {
  if (!client || !connectedAddress) {
    throw new Error("Wallet not connected. Click Connect Wallet and approve the request in your wallet extension.");
  }
  // The user may have switched networks in their wallet after connecting;
  // re-check before every write so we don't sign a tx against the wrong chain.
  await ensureCorrectChain(getInjectedProvider());
  return client;
}

// ---------------- reads (contract view methods return JSON strings) ----------------

async function readJson<T>(functionName: string, args: CalldataEncodable[] = []): Promise<T> {
  const raw = await getReadClient().readContract({
    address: CONTRACT_ADDRESS,
    functionName,
    args,
  });
  return JSON.parse(raw as string) as T;
}

interface ChainCase {
  case_id: string;
  title: string;
  description: string;
  archive_type: string;
  creator: string;
  created_at: string;
  status: string;
  case_context_uri: string;
  version_count: number;
  latest_map_id: string;
}

interface ChainVersion {
  version_id: string;
  case_id: string;
  submitter: string;
  title: string;
  version_label: string;
  content_uri: string;
  content_hash: string;
  source_uri: string;
  source_type: string;
  claimed_author: string;
  claimed_date: string;
  submitted_at: string;
  language: string;
  metadata_uri: string;
  status: string;
}

interface ChainMap {
  map_id: string;
  case_id: string;
  canonical_json: string;
  generated_at: string;
  map_status: string;
  confidence: number;
  uncertainty_level: string;
  generated_by: string;
}

interface ChainChallenge {
  challenge_id: string;
  case_id: string;
  challenger: string;
  target_type: string;
  target_id: string;
  challenge_reason: string;
  explanation: string;
  evidence_uri: string;
  evidence_hash: string;
  created_at: string;
}

interface ChainAudit {
  audit_id: string;
  case_id: string;
  event_type: string;
  actor: string;
  summary: string;
  data_hash: string;
  created_at: string;
}

function toEpoch(value: string): number {
  const t = Date.parse(value);
  return Number.isNaN(t) ? Date.now() : t;
}

function toArchiveCase(c: ChainCase): ArchiveCase {
  return {
    caseId: c.case_id,
    title: c.title,
    description: c.description,
    // The contract does not store full_context/tags/visibility separately;
    // those are frontend-only fields for local cases created before this
    // build went live and are left blank for chain-hydrated cases.
    fullContext: "",
    archiveType: c.archive_type as ArchiveCase["archiveType"],
    creator: c.creator,
    createdAt: toEpoch(c.created_at),
    status: c.status as ArchiveCase["status"],
    caseContextUri: c.case_context_uri,
    tags: [],
    visibility: "public",
    versionCount: c.version_count,
    latestMapId: c.latest_map_id || undefined,
  };
}

function toArchiveVersion(v: ChainVersion): ArchiveVersion {
  return {
    versionId: v.version_id,
    caseId: v.case_id,
    submitter: v.submitter,
    title: v.title,
    versionLabel: v.version_label,
    contentUri: v.content_uri,
    contentHash: v.content_hash,
    sourceUri: v.source_uri,
    sourceType: v.source_type as ArchiveVersion["sourceType"],
    claimedAuthor: v.claimed_author,
    claimedDate: v.claimed_date,
    submittedAt: toEpoch(v.submitted_at),
    language: v.language,
    metadataUri: v.metadata_uri,
    notes: "",
    status: v.status as ArchiveVersion["status"],
  };
}

function toArchivalMap(m: ChainMap): ArchivalMap {
  const canonical = JSON.parse(m.canonical_json) as {
    map_status: string;
    relationship_summary: string;
    likely_evolution: Array<{
      step: number;
      version_ids: string[];
      likely_period: string;
      placement_label: string;
      interpretation: string;
      confidence: number;
      supporting_notes: string;
    }>;
    agreement_zones: Array<{ summary: string; version_ids: string[]; confidence: number }>;
    divergence_points: Array<{
      point_id: string;
      divergence_type: string;
      summary: string;
      affected_versions: string[];
      severity: string;
      confidence: number;
      evidence_notes: string;
    }>;
    version_reliability: Array<{ version_id: string; reliability_level: string; reason: string }>;
    evidence_verification?: {
      verified_version_count: number;
      total_version_count: number;
      failed_challenge_evidence_count: number;
      sufficient_evidence: boolean;
      notes: string;
    };
    uncertainty_level: string;
    recommended_archive_treatment: string;
    human_notes: string;
    confidence: number;
  };

  const likelyEvolution: TimelineStep[] = canonical.likely_evolution.map((s) => ({
    step: s.step,
    versionIds: s.version_ids,
    likelyPeriod: s.likely_period,
    interpretation: s.interpretation,
    placementLabel: s.placement_label as TimelineStep["placementLabel"],
    confidence: s.confidence,
    supportingNotes: s.supporting_notes,
  }));

  const agreementZones: AgreementZone[] = canonical.agreement_zones.map((z) => ({
    summary: z.summary,
    versionIds: z.version_ids,
    confidence: z.confidence,
  }));

  const divergencePoints: DivergencePoint[] = canonical.divergence_points.map((p) => ({
    pointId: p.point_id,
    caseId: m.case_id,
    affectedVersions: p.affected_versions,
    divergenceType: p.divergence_type as DivergencePoint["divergenceType"],
    summary: p.summary,
    severity: p.severity as DivergencePoint["severity"],
    confidence: p.confidence,
    evidenceNotes: p.evidence_notes,
  }));

  const versionReliability: VersionReliability[] = canonical.version_reliability.map((r) => ({
    versionId: r.version_id,
    reliabilityLevel: r.reliability_level as VersionReliability["reliabilityLevel"],
    reason: r.reason,
  }));

  return {
    mapId: m.map_id,
    caseId: m.case_id,
    generatedAt: toEpoch(m.generated_at),
    mapStatus: canonical.map_status as ArchivalMap["mapStatus"],
    relationshipSummary: canonical.relationship_summary,
    likelyEvolution,
    agreementZones,
    divergencePoints,
    versionReliability,
    evidenceVerification: canonical.evidence_verification
      ? {
          verifiedVersionCount: canonical.evidence_verification.verified_version_count,
          totalVersionCount: canonical.evidence_verification.total_version_count,
          failedChallengeEvidenceCount: canonical.evidence_verification.failed_challenge_evidence_count,
          sufficientEvidence: canonical.evidence_verification.sufficient_evidence,
          notes: canonical.evidence_verification.notes,
        }
      : undefined,
    uncertaintyLevel: canonical.uncertainty_level as ArchivalMap["uncertaintyLevel"],
    recommendedArchiveTreatment: canonical.recommended_archive_treatment,
    humanNotes: canonical.human_notes,
    confidence: m.confidence,
  };
}

function toChallenge(c: ChainChallenge): Challenge {
  return {
    challengeId: c.challenge_id,
    caseId: c.case_id,
    challenger: c.challenger,
    targetType: c.target_type as Challenge["targetType"],
    targetId: c.target_id,
    challengeReason: c.challenge_reason as Challenge["challengeReason"],
    explanation: c.explanation,
    evidenceUri: c.evidence_uri,
    evidenceHash: c.evidence_hash,
    createdAt: toEpoch(c.created_at),
  };
}

const AUDIT_KIND_MAP: Record<string, HistoryEvent["kind"]> = {
  CASE_CREATED: "case_created",
  VERSION_SUBMITTED: "version_submitted",
  MAPPING_REQUESTED: "mapping_requested",
  GENLAYER_MAP_GENERATED: "map_generated",
  CHALLENGE_FILED: "challenge_filed",
  REMAPPING_REQUESTED: "remapping_requested",
  CASE_CLOSED: "case_closed",
};

const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

function toHistoryEvent(a: ChainAudit): HistoryEvent {
  return {
    eventId: a.audit_id,
    caseId: a.case_id,
    kind: AUDIT_KIND_MAP[a.event_type] ?? "case_created",
    summary: a.summary,
    actor: a.actor === "genlayer_consensus" ? "genlayer_validators" : a.actor,
    at: toEpoch(a.created_at),
    // The contract's audit log stores a domain hash (content hash, map id,
    // etc.), not the actual blockchain transaction hash — a GenVM contract
    // has no way to see its own tx hash during execution. Only pass through
    // data_hash if it happens to look like a real 32-byte tx hash; otherwise
    // leave it blank so the UI shows it as a reference, not a broken explorer link.
    txHash: TX_HASH_RE.test(a.data_hash) ? a.data_hash : "",
  };
}

export const reads = {
  async getAllCases(): Promise<ArchiveCase[]> {
    const raw = await readJson<ChainCase[]>("get_all_cases");
    return raw.map(toArchiveCase);
  },
  async getCase(caseId: string): Promise<ArchiveCase> {
    return toArchiveCase(await readJson<ChainCase>("get_case", [caseId]));
  },
  async getVersions(caseId: string): Promise<ArchiveVersion[]> {
    const raw = await readJson<ChainVersion[]>("get_versions", [caseId]);
    return raw.map(toArchiveVersion);
  },
  async getMapHistory(caseId: string): Promise<ArchivalMap[]> {
    const raw = await readJson<ChainMap[]>("get_map_history", [caseId]);
    return raw.filter((m) => m && m.map_id).map(toArchivalMap);
  },
  async getChallenges(caseId: string): Promise<Challenge[]> {
    const raw = await readJson<ChainChallenge[]>("get_challenges", [caseId]);
    return raw.map(toChallenge);
  },
  async getAuditTrail(caseId: string): Promise<HistoryEvent[]> {
    const raw = await readJson<ChainAudit[]>("get_audit_trail", [caseId]);
    return raw.map(toHistoryEvent);
  },
};

// ---------------- writes ----------------
// submit() returns the transaction hash as soon as it's accepted by the
// node; waitFinalized() resolves once GenLayer consensus finalizes it. The
// two are split so callers (store.ts) can drive a step-by-step tx UI in
// between, instead of blocking on the full round trip silently.

async function submit(functionName: string, args: CalldataEncodable[]): Promise<Hash> {
  const c = await requireWriteClient();
  const hash: unknown = await c.writeContract({
    address: CONTRACT_ADDRESS,
    functionName,
    args,
    value: 0n,
  });
  return hash as Hash;
}

export async function waitFinalized(hash: Hash): Promise<void> {
  await getReadClient().waitForTransactionReceipt({
    hash,
    status: "FINALIZED" as TransactionStatus,
    retries: 40,
    interval: 3000,
  });
}

const nowIso = () => new Date().toISOString();

export const writes = {
  createArchiveCase: (title: string, description: string, archiveType: string, caseContextUri: string) =>
    submit("create_archive_case", [title, description, archiveType, caseContextUri, nowIso()]),

  submitVersion: (args: {
    caseId: string;
    title: string;
    versionLabel: string;
    contentUri: string;
    contentHash: string;
    sourceUri: string;
    sourceType: string;
    claimedAuthor: string;
    claimedDate: string;
    language: string;
    metadataUri: string;
  }) =>
    submit("submit_version", [
      args.caseId,
      args.title,
      args.versionLabel,
      args.contentUri,
      args.contentHash,
      args.sourceUri,
      args.sourceType,
      args.claimedAuthor,
      args.claimedDate,
      args.language,
      args.metadataUri,
      nowIso(),
    ]),

  requestArchivalMapping: (caseId: string) => submit("request_archival_mapping", [caseId, nowIso()]),

  requestRemapping: (caseId: string) => submit("request_remapping", [caseId, nowIso()]),

  challengeVersionOrMap: (args: {
    caseId: string;
    targetType: string;
    targetId: string;
    challengeReason: string;
    explanation: string;
    evidenceUri: string;
    evidenceHash: string;
  }) =>
    submit("challenge_version_or_map", [
      args.caseId,
      args.targetType,
      args.targetId,
      args.challengeReason,
      args.explanation,
      args.evidenceUri,
      args.evidenceHash,
      nowIso(),
    ]),

  closeCase: (caseId: string) => submit("close_case", [caseId, nowIso()]),
};
