import type {
  ArchiveType,
  SourceType,
  DivergenceType,
  ChallengeReason,
  ChallengeTargetType,
} from "../types";

export const ARCHIVE_TYPES: { value: ArchiveType; label: string }[] = [
  { value: "document_versions", label: "Document versions" },
  { value: "institutional_record", label: "Institutional record" },
  { value: "community_memory", label: "Community memory" },
  { value: "incident_account", label: "Incident account" },
  { value: "historical_event", label: "Historical event" },
  { value: "governance_record", label: "Governance record" },
  { value: "legal_or_dispute_record", label: "Legal or dispute record" },
  { value: "media_or_screenshot_record", label: "Media or screenshot record" },
  { value: "translation_family", label: "Translation family" },
  { value: "mixed_evidence_archive", label: "Mixed evidence archive" },
];

export const SOURCE_TYPES: { value: SourceType; label: string }[] = [
  { value: "primary_document", label: "Primary document" },
  { value: "screenshot", label: "Screenshot" },
  { value: "transcript", label: "Transcript" },
  { value: "audio_transcript", label: "Audio transcript" },
  { value: "video_transcript", label: "Video transcript" },
  { value: "public_webpage", label: "Public webpage" },
  { value: "archive_snapshot", label: "Archive snapshot" },
  { value: "testimony", label: "Testimony" },
  { value: "email_or_message_export", label: "Email or message export" },
  { value: "institutional_file", label: "Institutional file" },
  { value: "translation", label: "Translation" },
  { value: "unknown", label: "Unknown" },
];

export const DIVERGENCE_TYPE_LABELS: Record<DivergenceType, string> = {
  added_claim: "Added claim",
  removed_claim: "Removed claim",
  changed_wording: "Changed wording",
  changed_date: "Changed date",
  changed_actor: "Changed actor",
  changed_causality: "Changed causality",
  changed_obligation: "Changed obligation",
  changed_tone: "Changed tone",
  translation_shift: "Translation shift",
  omission: "Omission",
  contradictory_memory: "Contradictory memory",
  metadata_conflict: "Metadata conflict",
  authorship_conflict: "Authorship conflict",
  source_chain_gap: "Source chain gap",
  possible_tampering: "Possible tampering",
  unclear_difference: "Unclear difference",
};

export const CHALLENGE_REASONS: { value: ChallengeReason; label: string }[] = [
  { value: "fake_or_forged", label: "Fake or forged" },
  { value: "wrongly_grouped", label: "Wrongly grouped" },
  { value: "important_version_missing", label: "Important version missing" },
  { value: "bad_timeline", label: "Bad timeline" },
  { value: "bad_translation_read", label: "Bad translation read" },
  { value: "metadata_ignored", label: "Metadata ignored" },
  { value: "source_chain_wrong", label: "Source chain wrong" },
  { value: "bias_or_overreach", label: "Bias or overreach" },
  { value: "new_evidence_available", label: "New evidence available" },
  { value: "other", label: "Other" },
];

export const TARGET_TYPES: { value: ChallengeTargetType; label: string }[] = [
  { value: "version", label: "A version" },
  { value: "archival_map", label: "The current archival map" },
  { value: "divergence_point", label: "A divergence point" },
];

export const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  mapping_requested: "Mapping requested",
  mapped: "Mapped",
  challenged: "Challenged",
  remapping_requested: "Remapping requested",
  closed: "Closed",
  submitted: "Submitted",
  included_in_map: "Included in map",
  flagged: "Flagged",
  excluded_from_map: "Excluded from map",
  superseded: "Superseded",
  resolved_map: "Resolved map",
  partial_map: "Partial map",
  insufficient_evidence: "Insufficient evidence",
  contested_map: "Contested map",
  requires_more_versions: "Requires more versions",
  low: "Low",
  medium: "Medium",
  high: "High",
  irreducible: "Irreducible",
  unknown: "Unknown",
  likely_first: "Likely first",
  possible_revision: "Possible revision",
  later_summary: "Later summary",
  disputed_branch: "Disputed branch",
  uncertain_placement: "Uncertain placement",
  parallel_memory: "Parallel memory",
};

export const TREATMENT_LABELS: Record<string, string> = {
  preserve_as_primary: "Preserve as primary",
  preserve_as_parallel: "Preserve as parallel",
  preserve_as_later_revision: "Preserve as later revision",
  preserve_as_translation_variant: "Preserve as translation variant",
  preserve_as_disputed_memory: "Preserve as disputed memory",
  preserve_as_low_confidence: "Preserve as low confidence",
  preserve_as_possible_tampering: "Preserve as possible tampering",
  exclude_from_current_map: "Exclude from current map",
  requires_more_evidence: "Requires more evidence",
};

export function label(key: string): string {
  return STATUS_LABELS[key] ?? TREATMENT_LABELS[key] ?? key.replace(/_/g, " ");
}

export function shortAddr(addr: string): string {
  if (!addr) return "—";
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

export function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function fmtDateTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
