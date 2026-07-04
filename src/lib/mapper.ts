// Simulated GenLayer validator reasoning.
// In production this runs inside the intelligent contract (see contracts/
// fractured_archive_resolver.py); validators compare versions with an LLM and
// reach equivalence-principle consensus on a canonical JSON map. Here we
// produce a deterministic, plausible archival map from the submitted
// versions so the whole product flow works without a chain connection.

import type {
  ArchiveCase,
  ArchiveVersion,
  ArchivalMap,
  DivergencePoint,
  TimelineStep,
  AgreementZone,
  VersionReliability,
  DivergenceType,
  Severity,
  UncertaintyLevel,
  MapStatus,
} from "../types";

let counter = 0;
export function uid(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

const OBLIGATION_WORDS = ["guarantee", "guaranteed", "will receive", "must", "shall", "promised"];
const SOFT_WORDS = ["may", "discretionary", "might", "could", "possible", "at our discretion"];
const NEGATION_WORDS = ["never", "no guarantee", "was not", "did not", "denies", "no promise"];

function textOf(v: ArchiveVersion): string {
  return `${v.title} ${v.notes}`.toLowerCase();
}

function hasAny(text: string, words: string[]): boolean {
  return words.some((w) => text.includes(w));
}

function reliabilityFor(v: ArchiveVersion, flagged: boolean): VersionReliability {
  if (flagged) {
    return {
      versionId: v.versionId,
      reliabilityLevel: "low",
      reason: "This version has an open challenge against it; treat with caution until reviewed.",
    };
  }
  if (!v.contentHash) {
    return {
      versionId: v.versionId,
      reliabilityLevel: "low",
      reason: "No content hash was provided, so the record cannot be locked against later edits.",
    };
  }
  if (v.sourceType === "screenshot" || v.sourceType === "unknown") {
    return {
      versionId: v.versionId,
      reliabilityLevel: "medium",
      reason:
        "Screenshots and unknown sources carry incomplete metadata; content is usable but provenance is weaker.",
    };
  }
  if (
    v.sourceType === "primary_document" ||
    v.sourceType === "archive_snapshot" ||
    v.sourceType === "institutional_file"
  ) {
    return {
      versionId: v.versionId,
      reliabilityLevel: "high",
      reason: "Primary or snapshotted source with a locked content hash and traceable origin.",
    };
  }
  return {
    versionId: v.versionId,
    reliabilityLevel: "medium",
    reason: "Secondary source; consistent metadata but depends on the accuracy of its transcription.",
  };
}

function parseClaimedDate(v: ArchiveVersion): number {
  const t = Date.parse(v.claimedDate);
  return Number.isNaN(t) ? v.submittedAt : t;
}

export function generateArchivalMap(
  archiveCase: ArchiveCase,
  versions: ArchiveVersion[],
  flaggedVersionIds: Set<string>,
  contested: boolean
): ArchivalMap {
  const included = versions.filter((v) => v.status !== "excluded_from_map");
  const ids = included.map((v) => v.versionId);

  if (included.length < 2) {
    return {
      mapId: uid("map"),
      caseId: archiveCase.caseId,
      generatedAt: Date.now(),
      mapStatus: "requires_more_versions",
      relationshipSummary:
        "Fewer than two usable versions were submitted. A relationship map requires at least two records to compare.",
      likelyEvolution: [],
      agreementZones: [],
      divergencePoints: [],
      versionReliability: included.map((v) => reliabilityFor(v, flaggedVersionIds.has(v.versionId))),
      uncertaintyLevel: "irreducible",
      recommendedArchiveTreatment: "requires_more_evidence",
      humanNotes: "Submit additional versions of this record family and request mapping again.",
      confidence: 20,
    };
  }

  // ---- Divergence detection (heuristic stand-in for validator reasoning) ----
  const points: DivergencePoint[] = [];
  const push = (
    divergenceType: DivergenceType,
    summary: string,
    affected: string[],
    severity: Severity,
    confidence: number,
    evidenceNotes: string
  ) =>
    points.push({
      pointId: uid("dp"),
      caseId: archiveCase.caseId,
      affectedVersions: affected,
      divergenceType,
      summary,
      severity,
      confidence,
      evidenceNotes,
    });

  const texts = included.map(textOf);
  const hard = included.filter((_, i) => hasAny(texts[i], OBLIGATION_WORDS));
  const soft = included.filter((_, i) => hasAny(texts[i], SOFT_WORDS));
  const negated = included.filter((_, i) => hasAny(texts[i], NEGATION_WORDS));

  if (hard.length && (soft.length || negated.length)) {
    push(
      "changed_obligation",
      "The strength of the commitment differs across versions: at least one version states a firm obligation while another softens or denies it.",
      [...new Set([...hard, ...soft, ...negated].map((v) => v.versionId))],
      "critical",
      82,
      "Obligation language ('guaranteed', 'will') appears in earlier-claimed versions but is replaced by discretionary or negating language in later ones."
    );
  }
  if (hard.length && negated.length) {
    push(
      "removed_claim",
      "A claim present in one version is absent or explicitly denied in another.",
      [...new Set([...hard, ...negated].map((v) => v.versionId))],
      "major",
      74,
      "Denial language suggests the original claim was removed or reframed rather than merely reworded."
    );
  }

  // wording differences between distinct titles
  const distinctTitles = new Set(included.map((v) => v.title.trim().toLowerCase()));
  if (distinctTitles.size > 1) {
    push(
      "changed_wording",
      "Versions describe the same record family with materially different wording.",
      ids,
      hard.length && (soft.length || negated.length) ? "moderate" : "moderate",
      68,
      "Surface phrasing differs between versions; some differences may be editorial, others substantive."
    );
  }

  // metadata conflicts: same claimed date different content, or missing hashes
  const dateGroups = new Map<string, ArchiveVersion[]>();
  for (const v of included) {
    const k = v.claimedDate || "unknown";
    dateGroups.set(k, [...(dateGroups.get(k) ?? []), v]);
  }
  const missingMeta = included.filter((v) => !v.claimedDate || !v.claimedAuthor);
  if (missingMeta.length) {
    push(
      "metadata_conflict",
      "One or more versions lack a claimed author or date, which prevents full metadata reconciliation.",
      missingMeta.map((v) => v.versionId),
      "moderate",
      70,
      "Incomplete metadata limits how confidently the timeline and authorship can be established."
    );
  }

  const authors = new Set(included.map((v) => v.claimedAuthor.trim().toLowerCase()).filter(Boolean));
  if (authors.size > 1) {
    push(
      "authorship_conflict",
      "Versions attribute the record to different authors or issuing bodies.",
      ids,
      "moderate",
      60,
      "Attribution differences may reflect institutional republication rather than forgery; evidence is not conclusive either way."
    );
  }

  const languages = new Set(included.map((v) => v.language.trim().toLowerCase()).filter(Boolean));
  if (languages.size > 1) {
    push(
      "translation_shift",
      "Versions exist in different languages; some divergence may originate in translation rather than editing.",
      ids,
      "minor",
      65,
      "Cross-language comparison should weight semantic rather than lexical differences."
    );
  }

  const flagged = included.filter((v) => flaggedVersionIds.has(v.versionId));
  for (const v of flagged) {
    push(
      "possible_tampering",
      `Version "${v.versionLabel}" has been challenged as potentially manipulated. This remains an allegation, not a finding.`,
      [v.versionId],
      "unknown",
      40,
      "Challenge evidence has been recorded but does not yet conclusively demonstrate tampering."
    );
  }

  if (!points.length) {
    push(
      "unclear_difference",
      "Versions differ, but the nature of the difference could not be classified from the submitted material alone.",
      ids,
      "unknown",
      45,
      "More context or higher-fidelity source material would help classify this divergence."
    );
  }

  // ---- Agreement zones ----
  const agreementZones: AgreementZone[] = [
    {
      summary:
        "All versions refer to the same underlying event or record family described in the case context.",
      versionIds: ids,
      confidence: 90,
    },
  ];
  if (authors.size <= 1 && authors.size > 0) {
    agreementZones.push({
      summary: "Versions agree on the originating author or institution.",
      versionIds: ids,
      confidence: 75,
    });
  }
  if (dateGroups.size === 1) {
    agreementZones.push({
      summary: "Versions agree on the claimed date of the underlying record.",
      versionIds: ids,
      confidence: 72,
    });
  }

  // ---- Likely evolution (ordered by claimed date, then submission) ----
  const ordered = [...included].sort((a, b) => parseClaimedDate(a) - parseClaimedDate(b));
  const likelyEvolution: TimelineStep[] = ordered.map((v, i) => {
    const isFirst = i === 0;
    const isLast = i === ordered.length - 1;
    const softened = hasAny(textOf(v), SOFT_WORDS);
    const denies = hasAny(textOf(v), NEGATION_WORDS);
    return {
      step: i + 1,
      versionIds: [v.versionId],
      likelyPeriod: v.claimedDate || "Unknown period",
      interpretation: isFirst
        ? `"${v.versionLabel}" appears to be the earliest record based on claimed dates and source type.`
        : denies
        ? `"${v.versionLabel}" reframes or denies claims present in earlier versions.`
        : softened
        ? `"${v.versionLabel}" softens the language of the earlier record; likely a revision.`
        : `"${v.versionLabel}" follows earlier versions in the claimed sequence.`,
      placementLabel: isFirst
        ? "likely_first"
        : denies && isLast
        ? "later_summary"
        : softened
        ? "possible_revision"
        : v.claimedDate
        ? "possible_revision"
        : "uncertain_placement",
      confidence: v.claimedDate ? (isFirst ? 78 : 66) : 40,
      supportingNotes: v.claimedDate
        ? `Claimed date ${v.claimedDate}; source type ${v.sourceType.replace(/_/g, " ")}.`
        : "No claimed date; placement inferred from submission order only.",
    };
  });

  // ---- Reliability, uncertainty, status, treatment ----
  const versionReliability = included.map((v) => reliabilityFor(v, flaggedVersionIds.has(v.versionId)));
  const criticalCount = points.filter((p) => p.severity === "critical" || p.severity === "major").length;
  const lowRel = versionReliability.filter((r) => r.reliabilityLevel === "low").length;

  let uncertaintyLevel: UncertaintyLevel;
  if (negated.length && hard.length && lowRel > 0) uncertaintyLevel = "high";
  else if (criticalCount > 0 || missingMeta.length > 0) uncertaintyLevel = "medium";
  else if (points.length <= 1) uncertaintyLevel = "low";
  else uncertaintyLevel = "medium";
  if (contested) uncertaintyLevel = uncertaintyLevel === "low" ? "medium" : "high";

  let mapStatus: MapStatus = "resolved_map";
  if (contested) mapStatus = "contested_map";
  else if (uncertaintyLevel === "high") mapStatus = "partial_map";
  else if (missingMeta.length === included.length) mapStatus = "insufficient_evidence";

  let treatment = "preserve_as_parallel";
  if (flagged.length) treatment = "preserve_as_possible_tampering";
  else if (languages.size > 1) treatment = "preserve_as_translation_variant";
  else if (criticalCount === 0 && points.length <= 1) treatment = "preserve_as_primary";
  else if (negated.length && hard.length) treatment = "preserve_as_parallel";

  const dominant =
    points.slice().sort((a, b) => sevRank(b.severity) - sevRank(a.severity))[0]?.divergenceType ??
    "unclear_difference";

  const relationshipSummary =
    `${included.length} versions were compared. ` +
    `${agreementZones.length} agreement zone${agreementZones.length === 1 ? "" : "s"} and ` +
    `${points.length} divergence point${points.length === 1 ? "" : "s"} were identified; the dominant ` +
    `divergence is "${dominant.replace(/_/g, " ")}". The versions appear to belong to the same record ` +
    `family, evolving from the earliest claimed record through later revisions or reframings. ` +
    `Contradictions have been preserved rather than resolved where the evidence does not support a single reading.`;

  return {
    mapId: uid("map"),
    caseId: archiveCase.caseId,
    generatedAt: Date.now(),
    mapStatus,
    relationshipSummary,
    likelyEvolution,
    agreementZones,
    divergencePoints: points,
    versionReliability,
    uncertaintyLevel,
    recommendedArchiveTreatment: treatment,
    humanNotes:
      uncertaintyLevel === "low"
        ? "The record family is coherent. Preserve all versions with the timeline context above."
        : "Do not treat any single version as the sole truth. Preserve all versions in parallel and revisit the map if new evidence or metadata becomes available.",
    confidence:
      uncertaintyLevel === "low" ? 84 : uncertaintyLevel === "medium" ? 68 : 48,
  };
}

function sevRank(s: Severity): number {
  return { critical: 4, major: 3, moderate: 2, minor: 1, unknown: 0 }[s];
}

export async function fakeHash(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return (
    "0x" +
    Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}
