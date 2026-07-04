import { useState } from "react";
import { Link } from "react-router-dom";
import type { ArchiveCase, ArchiveVersion, ArchivalMap, Challenge, HistoryEvent } from "../types";
import { label, shortAddr, fmtDate, fmtDateTime, DIVERGENCE_TYPE_LABELS } from "../lib/labels";
import {
  StatusBadge,
  UncertaintyBadge,
  ReliabilityBadge,
  ConfidenceBadge,
  ExplorerLink,
  EmptyState,
} from "./common";
import { DivergencePointCard } from "./DivergenceGraph";

// ---------------- case card ----------------

export function ArchiveCaseCard({
  archiveCase,
  map,
  challengeCount,
}: {
  archiveCase: ArchiveCase;
  map: ArchivalMap | null;
  challengeCount: number;
}) {
  const c = archiveCase;
  return (
    <Link to={`/cases/${c.caseId}`} className="case-card">
      <div className="spread">
        <StatusBadge status={c.status} />
        {map && <UncertaintyBadge level={map.uncertaintyLevel} />}
      </div>
      <h3>{c.title}</h3>
      <p className="desc">{c.description}</p>
      <div className="card-meta">
        <span>{label(c.archiveType)}</span>
        <span>{c.versionCount} version{c.versionCount === 1 ? "" : "s"}</span>
        <span>{map ? label(map.mapStatus) : "No map yet"}</span>
        <span>{challengeCount} challenge{challengeCount === 1 ? "" : "s"}</span>
        <span>Updated {fmtDate(lastUpdate(c, map))}</span>
      </div>
    </Link>
  );
}

function lastUpdate(c: ArchiveCase, map: ArchivalMap | null): number {
  return Math.max(c.createdAt, map?.generatedAt ?? 0);
}

// ---------------- version slip ----------------

export function VersionSlip({
  version,
  onCompare,
  onFlag,
  compact,
}: {
  version: ArchiveVersion;
  onCompare?: () => void;
  onFlag?: () => void;
  compact?: boolean;
}) {
  const v = version;
  const [copied, setCopied] = useState(false);
  return (
    <div className="version-slip">
      <div className="spread">
        <div>
          <span className="badge copper">{v.versionLabel}</span>
        </div>
        <StatusBadge status={v.status} />
      </div>
      <h4 style={{ marginTop: 8 }}>{v.title}</h4>
      <div className="slip-meta">
        <span><b>Submitter</b>{shortAddr(v.submitter)}</span>
        <span><b>Claimed author</b>{v.claimedAuthor || "—"}</span>
        <span><b>Claimed date</b>{v.claimedDate || "—"}</span>
        <span><b>Source type</b>{label(v.sourceType)}</span>
        <span><b>Language</b>{v.language || "—"}</span>
        <span><b>Submitted</b>{fmtDate(v.submittedAt)}</span>
      </div>
      <div className="hash" title="Content hash locking this version">{v.contentHash || "no content hash"}</div>
      {!compact && v.notes && <p style={{ fontSize: 13, color: "#252A31", margin: "10px 0 0" }}>{v.notes}</p>}
      {!compact && (
        <div className="slip-actions">
          {v.sourceUri && (
            <a className="btn secondary small" href={v.sourceUri} target="_blank" rel="noreferrer">
              Open source ↗
            </a>
          )}
          {v.contentUri && (
            <a className="btn secondary small" href={v.contentUri} target="_blank" rel="noreferrer">
              View version ↗
            </a>
          )}
          <button
            className="btn secondary small"
            onClick={() => {
              navigator.clipboard.writeText(v.contentHash);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? "Copied ✓" : "Copy hash"}
          </button>
          {onCompare && (
            <button className="btn secondary small" onClick={onCompare}>
              Compare
            </button>
          )}
          {onFlag && (
            <button className="btn secondary small" onClick={onFlag} style={{ color: "#B4473A" }}>
              Flag version
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------- timeline trace ----------------

export function TimelineTrace({ map, versions }: { map: ArchivalMap | null; versions: ArchiveVersion[] }) {
  if (!map || map.likelyEvolution.length === 0) {
    return (
      <EmptyState
        title="No timeline yet"
        body="No consensus map has been generated. Submit multiple versions, then request archival mapping to trace the record's likely evolution."
      />
    );
  }
  return (
    <div className="timeline">
      {map.likelyEvolution.map((step) => {
        const uncertain = step.confidence < 55;
        const names = step.versionIds
          .map((id) => versions.find((v) => v.versionId === id)?.versionLabel ?? id)
          .join(", ");
        return (
          <div key={step.step} className={`timeline-step ${uncertain ? "uncertain" : ""}`}>
            <div className="spread">
              <h4 className="serif">
                Step {step.step}: {names}
              </h4>
              <span className="row">
                <span className={`badge ${uncertain ? "amber" : "copper"}`}>{label(step.placementLabel)}</span>
                <ConfidenceBadge value={step.confidence} />
              </span>
            </div>
            <div className="period">Likely period: {step.likelyPeriod}</div>
            <p style={{ margin: "6px 0 2px", fontSize: 13.5 }}>{step.interpretation}</p>
            <p style={{ margin: 0, fontSize: 12.5, color: "#8B8A84" }}>{step.supportingNotes}</p>
          </div>
        );
      })}
      <p style={{ fontSize: 12.5, color: "#8B8A84" }}>
        Dashed markers indicate uncertain placement. This timeline is an interpretation, not a certainty.
      </p>
    </div>
  );
}

// ---------------- consensus map panel ----------------

export function ConsensusMapPanel({
  map,
  versions,
  historical,
}: {
  map: ArchivalMap;
  versions: ArchiveVersion[];
  historical?: boolean;
}) {
  const nameOf = (id: string) => versions.find((v) => v.versionId === id)?.versionLabel ?? id;
  return (
    <div className="stack">
      {historical && (
        <div className="warning-note">
          This is a historical map preserved for interpretive continuity. A newer map exists.
        </div>
      )}
      <div className="panel">
        <div className="panel-title">1 · Map status</div>
        <div className="row">
          <StatusBadge status={map.mapStatus} />
          <UncertaintyBadge level={map.uncertaintyLevel} />
          <ConfidenceBadge value={map.confidence} />
          <span className="badge neutral">Generated {fmtDateTime(map.generatedAt)}</span>
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">2 · Relationship summary</div>
        <p style={{ margin: 0 }}>{map.relationshipSummary}</p>
      </div>

      <div className="panel">
        <div className="panel-title">3 · Likely evolution</div>
        <TimelineTrace map={map} versions={versions} />
      </div>

      <div className="panel">
        <div className="panel-title">4 · Agreement zones</div>
        {map.agreementZones.length === 0 ? (
          <p style={{ margin: 0, color: "#8B8A84" }}>No agreement zones identified.</p>
        ) : (
          <div className="stack">
            {map.agreementZones.map((z, i) => (
              <div key={i} className="dp-card minor">
                <div className="spread">
                  <h4>Agreement zone {i + 1}</h4>
                  <ConfidenceBadge value={z.confidence} />
                </div>
                <p>{z.summary}</p>
                <p style={{ color: "#8B8A84" }}>{z.versionIds.map(nameOf).join(" · ")}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="panel">
        <div className="panel-title">5 · Divergence points</div>
        {map.divergencePoints.length === 0 ? (
          <p style={{ margin: 0, color: "#8B8A84" }}>No divergence points recorded in this map.</p>
        ) : (
          <div className="stack">
            {map.divergencePoints.map((p) => (
              <DivergencePointCard key={p.pointId} point={p} versions={versions} />
            ))}
          </div>
        )}
      </div>

      <div className="panel">
        <div className="panel-title">6 · Version reliability</div>
        <div className="stack">
          {map.versionReliability.map((r) => (
            <div key={r.versionId} className="dp-card unknown">
              <div className="spread">
                <h4>{nameOf(r.versionId)}</h4>
                <ReliabilityBadge level={r.reliabilityLevel} />
              </div>
              <p>{r.reason}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">7 · Uncertainty level</div>
        <div className="row">
          <UncertaintyBadge level={map.uncertaintyLevel} />
        </div>
        <p style={{ marginBottom: 0, fontSize: 13, color: "#8B8A84" }}>
          {map.uncertaintyLevel === "irreducible"
            ? "The available evidence cannot resolve this record family further. The contradiction itself is the archival object."
            : "Uncertainty can be reduced by submitting additional versions, metadata, or provenance evidence and requesting a remap."}
        </p>
      </div>

      <div className="panel">
        <div className="panel-title">8 · Recommended archive treatment</div>
        <span className="badge copper" style={{ fontSize: 13 }}>
          {label(map.recommendedArchiveTreatment)}
        </span>
      </div>

      <div className="panel">
        <div className="panel-title">9 · Human notes</div>
        <p style={{ margin: 0 }}>{map.humanNotes}</p>
      </div>
    </div>
  );
}

// ---------------- challenges & history ----------------

export function ChallengeList({ challenges, versions }: { challenges: Challenge[]; versions: ArchiveVersion[] }) {
  if (challenges.length === 0) {
    return (
      <EmptyState
        title="No challenges"
        body="No one has challenged this map yet. The current interpretation remains active, but future evidence can still reshape the archive."
      />
    );
  }
  return (
    <div className="stack">
      {challenges.map((ch) => {
        const targetName =
          ch.targetType === "version"
            ? versions.find((v) => v.versionId === ch.targetId)?.versionLabel ?? ch.targetId
            : label(ch.targetType);
        return (
          <div key={ch.challengeId} className="dp-card major">
            <div className="spread">
              <h4>
                {label(ch.challengeReason)} — against {targetName}
              </h4>
              <span className="badge neutral">{fmtDateTime(ch.createdAt)}</span>
            </div>
            <p>{ch.explanation || "No explanation supplied."}</p>
            <p style={{ color: "#8B8A84" }}>
              Challenger {shortAddr(ch.challenger)}
              {ch.evidenceUri && (
                <>
                  {" · "}
                  <a href={ch.evidenceUri} target="_blank" rel="noreferrer">
                    evidence ↗
                  </a>
                </>
              )}
              {ch.evidenceHash && <span className="mono"> · {ch.evidenceHash.slice(0, 14)}…</span>}
            </p>
          </div>
        );
      })}
    </div>
  );
}

export function HistoryList({ events }: { events: HistoryEvent[] }) {
  const sorted = [...events].sort((a, b) => b.at - a.at);
  return (
    <div className="timeline">
      {sorted.map((ev) => (
        <div key={ev.eventId} className="timeline-step">
          <div className="spread">
            <h4 className="serif" style={{ fontSize: 15.5, fontFamily: "Inter, sans-serif" }}>
              {ev.summary}
            </h4>
            <span className="badge neutral">{fmtDateTime(ev.at)}</span>
          </div>
          <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "#8B8A84" }}>
            {ev.actor === "genlayer_validators" ? "GenLayer validators" : shortAddr(ev.actor)} ·{" "}
            <ExplorerLink txHash={ev.txHash || ev.eventId} />
          </p>
        </div>
      ))}
    </div>
  );
}
