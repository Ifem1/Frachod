import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useAppState } from "../lib/store";
import { label, fmtDate, fmtDateTime, DIVERGENCE_TYPE_LABELS } from "../lib/labels";
import { StatusBadge, UncertaintyBadge, EmptyState } from "../components/common";
import { TimelineTrace } from "../components/archive";
import { DivergencePointCard } from "../components/DivergenceGraph";

// Public dossier view: shareable, no wallet clutter.
export function PublicArchive() {
  const { caseId = "" } = useParams();
  const state = useAppState();
  const c = state.cases.find((x) => x.caseId === caseId);
  const versions = useMemo(() => state.versions.filter((v) => v.caseId === caseId), [state.versions, caseId]);
  const maps = state.maps.filter((m) => m.caseId === caseId).sort((a, b) => b.generatedAt - a.generatedAt);
  const map = maps[0] ?? null;

  if (!c) {
    return (
      <div className="empty-state" style={{ marginTop: 40 }}>
        <h3>Archive not found</h3>
        <Link to="/cases" className="btn secondary">Browse Archive Cases</Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 820, margin: "0 auto" }}>
      <div style={{ textAlign: "center", padding: "44px 0 10px" }}>
        <div className="hero-kicker">Public Archival Dossier</div>
        <h1 className="page-title" style={{ margin: "6px 0 10px" }}>{c.title}</h1>
        <div className="row" style={{ justifyContent: "center" }}>
          <StatusBadge status={c.status} />
          {map && <UncertaintyBadge level={map.uncertaintyLevel} />}
          <span className="badge neutral">{label(c.archiveType)}</span>
          <span className="badge neutral">Opened {fmtDate(c.createdAt)}</span>
        </div>
      </div>

      <div className="stack" style={{ marginTop: 20 }}>
        <div className="panel">
          <div className="panel-title">Context</div>
          <p style={{ margin: 0 }}>{c.description}</p>
          {c.fullContext && <p style={{ margin: "8px 0 0", color: "#8B8A84", fontSize: 13.5 }}>{c.fullContext}</p>}
        </div>

        <div className="panel">
          <div className="panel-title">Versions on record ({versions.length})</div>
          <div className="stack">
            {versions.map((v) => (
              <div key={v.versionId} className="dp-card unknown">
                <div className="spread">
                  <h4>{v.versionLabel}</h4>
                  <StatusBadge status={v.status} />
                </div>
                <p>{v.title}</p>
                <p style={{ color: "#8B8A84" }}>
                  {v.claimedAuthor || "Unknown author"} · {v.claimedDate || "undated"} · {label(v.sourceType)}
                  {v.sourceUri && <> · <a href={v.sourceUri} target="_blank" rel="noreferrer">source ↗</a></>}
                </p>
                <p className="hash" style={{ margin: 0 }}>{v.contentHash}</p>
              </div>
            ))}
          </div>
        </div>

        {map ? (
          <>
            <div className="panel">
              <div className="panel-title">Current map summary</div>
              <p style={{ margin: 0 }}>{map.relationshipSummary}</p>
              <div className="row" style={{ marginTop: 12 }}>
                <StatusBadge status={map.mapStatus} />
                <span className="badge copper">{label(map.recommendedArchiveTreatment)}</span>
                <span className="badge red"><span className="dot" />{map.divergencePoints.length} divergence point{map.divergencePoints.length === 1 ? "" : "s"}</span>
              </div>
            </div>

            <div className="panel">
              <div className="panel-title">Likely evolution</div>
              <TimelineTrace map={map} versions={versions} />
            </div>

            <div className="panel">
              <div className="panel-title">Where the record fractures</div>
              <div className="stack">
                {map.divergencePoints.map((p) => (
                  <DivergencePointCard key={p.pointId} point={p} versions={versions} />
                ))}
              </div>
            </div>

            {maps.length > 1 && (
              <div className="panel">
                <div className="panel-title">Map history</div>
                <div className="stack">
                  {maps.slice(1).map((m) => (
                    <div key={m.mapId} className="map-history-item spread">
                      <span>
                        <StatusBadge status={m.mapStatus} />{" "}
                        <span style={{ fontSize: 12.5, color: "#8B8A84" }}>{fmtDateTime(m.generatedAt)}</span>
                      </span>
                      <span className="badge neutral">
                        {m.divergencePoints.length} divergences · uncertainty {m.uncertaintyLevel}
                      </span>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: 12.5, color: "#8B8A84", margin: "10px 0 0" }}>
                  Prior interpretations are preserved. The archive remembers how it was read.
                </p>
              </div>
            )}
          </>
        ) : (
          <EmptyState
            title="No consensus map yet"
            body="No consensus map has been generated for this archive case."
          />
        )}

        <p style={{ textAlign: "center", color: "#8B8A84", fontSize: 13 }}>
          <Link to={`/cases/${caseId}`}>Open the full case room →</Link>
        </p>
      </div>
    </div>
  );
}
