export type CaseStatus =
  | "open"
  | "mapping_requested"
  | "mapped"
  | "challenged"
  | "remapping_requested"
  | "closed";

export type ArchiveType =
  | "document_versions"
  | "institutional_record"
  | "community_memory"
  | "incident_account"
  | "historical_event"
  | "governance_record"
  | "legal_or_dispute_record"
  | "media_or_screenshot_record"
  | "translation_family"
  | "mixed_evidence_archive";

export type SourceType =
  | "primary_document"
  | "screenshot"
  | "transcript"
  | "audio_transcript"
  | "video_transcript"
  | "public_webpage"
  | "archive_snapshot"
  | "testimony"
  | "email_or_message_export"
  | "institutional_file"
  | "translation"
  | "unknown";

export type VersionStatus =
  | "submitted"
  | "included_in_map"
  | "flagged"
  | "excluded_from_map"
  | "superseded";

export type DivergenceType =
  | "added_claim"
  | "removed_claim"
  | "changed_wording"
  | "changed_date"
  | "changed_actor"
  | "changed_causality"
  | "changed_obligation"
  | "changed_tone"
  | "translation_shift"
  | "omission"
  | "contradictory_memory"
  | "metadata_conflict"
  | "authorship_conflict"
  | "source_chain_gap"
  | "possible_tampering"
  | "unclear_difference";

export type Severity = "minor" | "moderate" | "major" | "critical" | "unknown";
export type MapStatus =
  | "resolved_map"
  | "partial_map"
  | "insufficient_evidence"
  | "contested_map"
  | "requires_more_versions";
export type UncertaintyLevel = "low" | "medium" | "high" | "irreducible";
export type ReliabilityLevel = "high" | "medium" | "low" | "unknown";

export type ChallengeTargetType = "version" | "archival_map" | "divergence_point";

export type ChallengeReason =
  | "fake_or_forged"
  | "wrongly_grouped"
  | "important_version_missing"
  | "bad_timeline"
  | "bad_translation_read"
  | "metadata_ignored"
  | "source_chain_wrong"
  | "bias_or_overreach"
  | "new_evidence_available"
  | "other";

export interface ArchiveCase {
  caseId: string;
  title: string;
  description: string;
  fullContext: string;
  archiveType: ArchiveType;
  creator: string;
  createdAt: number;
  status: CaseStatus;
  caseContextUri: string;
  tags: string[];
  visibility: "public" | "unlisted";
  versionCount: number;
  latestMapId?: string;
}

export interface ArchiveVersion {
  versionId: string;
  caseId: string;
  submitter: string;
  title: string;
  versionLabel: string;
  contentUri: string;
  contentHash: string;
  sourceUri: string;
  sourceType: SourceType;
  claimedAuthor: string;
  claimedDate: string;
  submittedAt: number;
  language: string;
  metadataUri: string;
  notes: string;
  status: VersionStatus;
}

export interface TimelineStep {
  step: number;
  versionIds: string[];
  likelyPeriod: string;
  interpretation: string;
  placementLabel:
    | "likely_first"
    | "possible_revision"
    | "later_summary"
    | "disputed_branch"
    | "uncertain_placement"
    | "parallel_memory";
  confidence: number;
  supportingNotes: string;
}

export interface AgreementZone {
  summary: string;
  versionIds: string[];
  confidence: number;
}

export interface DivergencePoint {
  pointId: string;
  caseId: string;
  affectedVersions: string[];
  divergenceType: DivergenceType;
  summary: string;
  severity: Severity;
  confidence: number;
  evidenceNotes: string;
}

export interface VersionReliability {
  versionId: string;
  reliabilityLevel: ReliabilityLevel;
  reason: string;
}

export interface ArchivalMap {
  mapId: string;
  caseId: string;
  generatedAt: number;
  mapStatus: MapStatus;
  relationshipSummary: string;
  likelyEvolution: TimelineStep[];
  agreementZones: AgreementZone[];
  divergencePoints: DivergencePoint[];
  versionReliability: VersionReliability[];
  uncertaintyLevel: UncertaintyLevel;
  recommendedArchiveTreatment: string;
  humanNotes: string;
  confidence: number;
}

export interface Challenge {
  challengeId: string;
  caseId: string;
  challenger: string;
  targetType: ChallengeTargetType;
  targetId: string;
  challengeReason: ChallengeReason;
  explanation: string;
  evidenceUri: string;
  evidenceHash: string;
  createdAt: number;
}

export interface HistoryEvent {
  eventId: string;
  caseId: string;
  kind:
    | "case_created"
    | "version_submitted"
    | "mapping_requested"
    | "map_generated"
    | "challenge_filed"
    | "remapping_requested"
    | "case_closed";
  summary: string;
  actor: string;
  at: number;
  txHash: string;
}

export type TxState =
  | "idle"
  | "preparing"
  | "wallet_confirmation"
  | "submitted"
  | "awaiting_finalization"
  | "finalized"
  | "failed";
