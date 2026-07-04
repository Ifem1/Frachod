import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  useAppState,
  requestArchivalMapping,
  requestRemapping,
  challengeVersionOrMap,
  closeCase,
  connectWallet,
  refreshCaseDetail,
  TxHandle,
} from "../lib/store";
import { isLiveMode } from "../lib/genlayer";
import { label, shortAddr, fmtDate, fmtDateTime, CHALLENGE_REASONS, TARGET_TYPES, DIVERGENCE_TYPE_LABELS } from "../lib/labels";
import {
  StatusBadge,
  UncertaintyBadge,
  TransactionStatusPanel,
  EmptyState,
  ConfidenceBadge,
} from "../components/common";
import { VersionSlip, TimelineTrace, ConsensusMapPanel, ChallengeList, HistoryList } from "../components/archive";
import { DivergenceGraph } from "../components/DivergenceGraph";
import type { ChallengeReason, ChallengeTargetType, ArchiveVersion, ArchivalMap } from "../types";

const TABS = ["overview", "versions", "divergence", "timeline", "map", "challenges", "history"] as const;
const TAB_LABELS: Record<string, string> = {
  overview: "Overview",
  versions: "Versions",
  divergence: "Divergence Map",
  timeline: "Timeline",
  map: "Consensus Map",
  challenges: "Challenges",
  history: "History",
};

export function CaseDetail() {
  const { caseId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") ?? "overview") as (typeof TABS)[number];
  const state = useAppState();
  const { wallet } = state;

  const c = state.cases.find((x) => x.caseId === caseId);
  const versions = useMemo(() => state.versions.filter((v) => v.caseId === caseId), [state.versions, caseId]);
  const caseMaps = useMemo(
    () => state.maps.filter((m) => m.caseId === caseId).sort((a, b) => b.generatedAt - a.generatedAt),
    [state.maps, caseId]
  );
  const currentMap = caseMaps[0] ?? null;
  const challenges = state.challenges.filter((ch) => ch.caseId === caseId);
  const events = state.history.filter((ev) => ev.caseId === caseId);

  useEffect(() => {
    if (isLiveMode() && caseId) refreshCaseDetail(caseId);
  }, [caseId]);

  const [tx, setTx] = useState<TxHandle>({ state: "idle" });
  const [txMessage, setTxMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [showChallenge, setShowChallenge] = useState(false);
  const [challengePrefill, setChallengePrefill] = useState<{ targetType: ChallengeTargetType; targetId: string } | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const busy = tx.state !== "idle" && tx.state !== "failed" && tx.state !== "finalized";

  if (!c) {
    return (
      <div className="empty-state" style={{ marginTop: 40 }}>
        <h3>Case not found</h3>
        <Link to="/cases" className="btn secondary">Back to Archive Cases</Link>
      </div>
    );
  }

  function setTab(t: string) {
    params.set("tab", t);
    setParams(params, { replace: true });
  }

  async function act(fn: () => Promise<void>, message: string) {
    setActionError("");
    setTxMessage(message);
    try {
      if (!wallet) await connectWallet();
      await fn();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
      setTx({ state: "idle" });
    }
  }

  const canMap = versions.length >= 2 && c.status !== "closed";

  return (
    <>
      <div className="row" style={{ marginTop: 26 }}>
        <Link to="/cases" style={{ fontSize: 13 }}>← Archive Cases</Link>
      </div>

      <div className="three-col" style={{ marginTop: 14 }}>
        {/* -------- left column -------- */}
        <div className="panel">
          <div className="panel-title">Case File</div>
          <h3 style={{ fontSize: 23 }}>{c.title}</h3>
          <div className="kv"><b>Type</b><span>{label(c.archiveType)}</span></div>
          <div className="kv"><b>Status</b><StatusBadge status={c.status} /></div>
          <div className="kv"><b>Creator</b><span className="mono">{shortAddr(c.creator)}</span></div>
          <div className="kv"><b>Created</b><span>{fmtDate(c.createdAt)}</span></div>
          <div className="kv"><b>Versions</b><span>{versions.length}</span></div>
          <div className="kv">
            <b>Uncertainty</b>
            <span>{currentMap ? <UncertaintyBadge level={currentMap.uncertaintyLevel} /> : "No map yet"}</span>
          </div>
          <div className="kv">
            <b>Latest map</b>
            <span>{currentMap ? `${label(currentMap.mapStatus)} · ${fmtDate(currentMap.generatedAt)}` : "—"}</span>
          </div>
          {c.tags.length > 0 && (
            <div className="row" style={{ marginTop: 10 }}>
              {c.tags.map((t) => <span key={t} className="tag-chip">{t}</span>)}
            </div>
          )}
        </div>

        {/* -------- center panel -------- */}
        <div>
          <p style={{ margin: "0 0 6px", fontSize: 15 }}>{c.description}</p>
          {c.fullContext && <p style={{ margin: 0, fontSize: 13.5, color: "#8B8A84" }}>{c.fullContext}</p>}
          {c.caseContextUri && (
            <p style={{ fontSize: 12.5 }} className="mono">
              context: <a href={c.caseContextUri} target="_blank" rel="noreferrer">{c.caseContextUri}</a>
            </p>
          )}

          <div className="tabs">
            {TABS.map((t) => (
              <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
                {TAB_LABELS[t]}
                {t === "versions" && ` (${versions.length})`}
                {t === "challenges" && ` (${challenges.length})`}
              </button>
            ))}
          </div>

          {tab === "overview" && (
            <div className="stack">
              {currentMap ? (
                <>
                  <div className="panel">
                    <div className="panel-title">Current map — relationship summary</div>
                    <p style={{ margin: 0 }}>{currentMap.relationshipSummary}</p>
                    <div className="row" style={{ marginTop: 12 }}>
                      <StatusBadge status={currentMap.mapStatus} />
                      <UncertaintyBadge level={currentMap.uncertaintyLevel} />
                      <ConfidenceBadge value={currentMap.confidence} />
                      <span className="badge copper">{label(currentMap.recommendedArchiveTreatment)}</span>
                    </div>
                  </div>
                  <div className="panel">
                    <div className="panel-title">Fracture summary</div>
                    <div className="row">
                      <span className="badge red"><span className="dot" />{currentMap.divergencePoints.length} divergence point{currentMap.divergencePoints.length === 1 ? "" : "s"}</span>
                      <span className="badge green"><span className="dot" />{currentMap.agreementZones.length} agreement zone{currentMap.agreementZones.length === 1 ? "" : "s"}</span>
                      {currentMap.divergencePoints[0] && (
                        <span className="badge amber">
                          dominant: {DIVERGENCE_TYPE_LABELS[currentMap.divergencePoints[0].divergenceType]}
                        </span>
                      )}
                    </div>
                  </div>
                </>
              ) : versions.length === 0 ? (
                <EmptyState
                  title="No versions yet"
                  body="This archive case has no submitted versions yet. Add at least two versions before requesting a GenLayer archival map."
                  action={<Link to={`/cases/${caseId}/submit`} className="btn copper" style={{ marginTop: 12 }}>Submit First Version</Link>}
                />
              ) : (
                <EmptyState
                  title="No map yet"
                  body="No consensus map has been generated. Submit multiple versions, then request archival mapping."
                />
              )}
              <div className="panel">
                <div className="panel-title">Version stack</div>
                <div className="stack">
                  {versions.map((v) => <VersionSlip key={v.versionId} version={v} compact />)}
                </div>
              </div>
            </div>
          )}

          {tab === "versions" && (
            <div className="stack">
              <div className="spread">
                <div className="panel-title" style={{ margin: 0 }}>Version Vault</div>
                <Link to={`/cases/${caseId}/submit`} className="btn small copper">Submit Version</Link>
              </div>
              {versions.length === 0 ? (
                <EmptyState
                  title="Version Vault is empty"
                  body="This archive case has no submitted versions yet. Add at least two versions before requesting a GenLayer archival map."
                />
              ) : (
                versions.map((v) => (
                  <VersionSlip
                    key={v.versionId}
                    version={v}
                    onCompare={() =>
                      setCompareIds((ids) =>
                        ids.includes(v.versionId)
                          ? ids.filter((x) => x !== v.versionId)
                          : [...ids.slice(-1), v.versionId]
                      )
                    }
                    onFlag={() => {
                      setChallengePrefill({ targetType: "version", targetId: v.versionId });
                      setShowChallenge(true);
                      setTab("challenges");
                    }}
                  />
                ))
              )}
              {compareIds.length === 2 && (
                <CompareDrawer
                  a={versions.find((v) => v.versionId === compareIds[0])!}
                  b={versions.find((v) => v.versionId === compareIds[1])!}
                  onClose={() => setCompareIds([])}
                />
              )}
              {compareIds.length === 1 && (
                <div className="guidance">Select a second version to compare side by side.</div>
              )}
            </div>
          )}

          {tab === "divergence" && (
            <div className="stack">
              <DivergenceGraph versions={versions} map={currentMap} />
            </div>
          )}

          {tab === "timeline" && <TimelineTrace map={currentMap} versions={versions} />}

          {tab === "map" && (
            <div className="stack">
              {currentMap ? (
                <>
                  <ConsensusMapPanel map={currentMap} versions={versions} />
                  {caseMaps.length > 1 && <MapHistoryDrawer maps={caseMaps.slice(1)} versions={versions} />}
                </>
              ) : (
                <EmptyState
                  title="No map yet"
                  body="No consensus map has been generated. Submit multiple versions, then request archival mapping."
                />
              )}
            </div>
          )}

          {tab === "challenges" && (
            <div className="stack">
              {showChallenge ? (
                <ChallengeForm
                  caseId={caseId}
                  versions={versions}
                  prefill={challengePrefill}
                  onDone={() => { setShowChallenge(false); setChallengePrefill(null); }}
                />
              ) : (
                <div className="row">
                  <button className="btn danger" onClick={() => setShowChallenge(true)} disabled={c.status === "closed"}>
                    Open Challenge / Remapping Room
                  </button>
                </div>
              )}
              <ChallengeList challenges={challenges} versions={versions} />
              {challenges.length > 0 && (
                <div className="guidance">
                  Prior maps are never deleted. After a challenge, request remapping — the previous
                  interpretation remains visible for historical continuity.
                </div>
              )}
            </div>
          )}

          {tab === "history" && <HistoryList events={events} />}
        </div>

        {/* -------- right column -------- */}
        <div className="stack">
          <div className="panel">
            <div className="panel-title">Actions</div>
            <div className="stack" style={{ gap: 8 }}>
              <Link to={`/cases/${caseId}/submit`} className="btn secondary" style={{ justifyContent: "center" }}>
                Submit Version
              </Link>
              <button
                className="btn copper"
                disabled={!canMap || busy}
                onClick={() =>
                  act(
                    () => requestArchivalMapping(caseId, setTx),
                    "GenLayer validators are preparing an archival map. This may produce a structured interpretation, not a single truth label."
                  )
                }
                title={canMap ? "" : "At least two versions are required"}
              >
                {currentMap ? "Request Fresh Mapping" : "Request Archival Mapping"}
              </button>
              <button
                className="btn secondary"
                disabled={!currentMap || busy || c.status === "closed"}
                onClick={() =>
                  act(
                    () => requestRemapping(caseId, setTx),
                    "Remapping requested. The previous map will remain visible for historical continuity."
                  )
                }
              >
                Request Remapping
              </button>
              <button
                className="btn secondary"
                disabled={busy || c.status === "closed"}
                onClick={() => { setShowChallenge(true); setTab("challenges"); }}
              >
                Challenge Map / Version
              </button>
              <button
                className="btn secondary"
                disabled={busy || c.status === "closed" || wallet !== c.creator}
                title={wallet !== c.creator ? "Only the case creator can close this case" : ""}
                onClick={() => act(() => closeCase(caseId, setTx), "Closing case to new submissions. Records remain readable.")}
              >
                Close Case
              </button>
              <Link to={`/archive/${caseId}`} className="btn secondary" style={{ justifyContent: "center" }}>
                Public Archive View
              </Link>
            </div>
            {actionError && <div className="error-note" style={{ marginTop: 10 }}>{actionError}</div>}
          </div>
          <TransactionStatusPanel tx={tx} message={txMessage} />
          {currentMap && (
            <div className="panel">
              <div className="panel-title">Current map</div>
              <div className="kv"><b>Status</b><StatusBadge status={currentMap.mapStatus} /></div>
              <div className="kv"><b>Uncertainty</b><UncertaintyBadge level={currentMap.uncertaintyLevel} /></div>
              <div className="kv"><b>Treatment</b><span>{label(currentMap.recommendedArchiveTreatment)}</span></div>
              <div className="kv"><b>Map ID</b><span className="mono">{currentMap.mapId}</span></div>
              <div className="kv"><b>Prior maps</b><span>{caseMaps.length - 1}</span></div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ---------------- compare drawer ----------------

function CompareDrawer({ a, b, onClose }: { a: ArchiveVersion; b: ArchiveVersion; onClose: () => void }) {
  const rows: [string, string, string][] = [
    ["Title", a.title, b.title],
    ["Claimed author", a.claimedAuthor || "—", b.claimedAuthor || "—"],
    ["Claimed date", a.claimedDate || "—", b.claimedDate || "—"],
    ["Source type", label(a.sourceType), label(b.sourceType)],
    ["Language", a.language || "—", b.language || "—"],
    ["Content hash", a.contentHash.slice(0, 18) + "…", b.contentHash.slice(0, 18) + "…"],
    ["Notes", a.notes || "—", b.notes || "—"],
  ];
  return (
    <div className="panel">
      <div className="spread">
        <div className="panel-title" style={{ margin: 0 }}>
          Comparing: {a.versionLabel} ↔ {b.versionLabel}
        </div>
        <button className="btn secondary small" onClick={onClose}>Close</button>
      </div>
      <div style={{ overflowX: "auto", marginTop: 10 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <tbody>
            {rows.map(([k, va, vb]) => {
              const differs = va !== vb;
              return (
                <tr key={k} style={{ borderTop: "1px dashed rgba(37,42,49,0.16)" }}>
                  <td style={{ padding: "8px 10px", color: "#8B8A84", whiteSpace: "nowrap", verticalAlign: "top" }}>{k}</td>
                  <td style={{ padding: "8px 10px", verticalAlign: "top", background: differs ? "rgba(180,71,58,0.06)" : undefined }}>{va}</td>
                  <td style={{ padding: "8px 10px", verticalAlign: "top", background: differs ? "rgba(180,71,58,0.06)" : undefined }}>{vb}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 12.5, color: "#8B8A84", margin: "8px 0 0" }}>
        Shaded rows differ between the two versions.
      </p>
    </div>
  );
}

// ---------------- challenge form ----------------

function ChallengeForm({
  caseId,
  versions,
  prefill,
  onDone,
}: {
  caseId: string;
  versions: ArchiveVersion[];
  prefill: { targetType: ChallengeTargetType; targetId: string } | null;
  onDone: () => void;
}) {
  const { wallet, maps } = useAppState();
  const caseMaps = maps.filter((m) => m.caseId === caseId).sort((a, b) => b.generatedAt - a.generatedAt);
  const currentMap = caseMaps[0] ?? null;
  const [tx, setTx] = useState<TxHandle>({ state: "idle" });
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    targetType: (prefill?.targetType ?? "archival_map") as ChallengeTargetType,
    targetId: prefill?.targetId ?? currentMap?.mapId ?? "",
    challengeReason: "new_evidence_available" as ChallengeReason,
    explanation: "",
    evidenceUri: "",
    evidenceHash: "",
  });
  const busy = tx.state !== "idle" && tx.state !== "failed";

  const targets =
    form.targetType === "version"
      ? versions.map((v) => ({ id: v.versionId, name: v.versionLabel }))
      : form.targetType === "divergence_point"
      ? (currentMap?.divergencePoints ?? []).map((p) => ({
          id: p.pointId,
          name: `${DIVERGENCE_TYPE_LABELS[p.divergenceType]} — ${p.summary.slice(0, 60)}…`,
        }))
      : currentMap
      ? [{ id: currentMap.mapId, name: `Current map (${label(currentMap.mapStatus)})` }]
      : [];

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      if (!wallet) await connectWallet();
      if (!form.targetId) throw new Error("Select a challenge target");
      await challengeVersionOrMap({ caseId, ...form }, setTx);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setTx({ state: "idle" });
    }
  }

  return (
    <form onSubmit={onSubmit} className="panel stack">
      <div className="panel-title">Challenge / Remapping Room</div>
      <div className="form-grid">
        <label className="field">
          Target type
          <select
            value={form.targetType}
            onChange={(e) => {
              const targetType = e.target.value as ChallengeTargetType;
              const first =
                targetType === "version"
                  ? versions[0]?.versionId
                  : targetType === "divergence_point"
                  ? currentMap?.divergencePoints[0]?.pointId
                  : currentMap?.mapId;
              setForm({ ...form, targetType, targetId: first ?? "" });
            }}
          >
            {TARGET_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
        <label className="field">
          Target
          <select value={form.targetId} onChange={(e) => setForm({ ...form, targetId: e.target.value })}>
            {targets.length === 0 && <option value="">No targets available</option>}
            {targets.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <label className="field full">
          Challenge reason
          <select value={form.challengeReason} onChange={(e) => setForm({ ...form, challengeReason: e.target.value as ChallengeReason })}>
            {CHALLENGE_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </label>
        <label className="field full">
          Explanation
          <textarea required value={form.explanation} onChange={(e) => setForm({ ...form, explanation: e.target.value })}
            placeholder="Explain what is wrong and what evidence supports the challenge." />
        </label>
        <label className="field">
          Evidence URI
          <input value={form.evidenceUri} onChange={(e) => setForm({ ...form, evidenceUri: e.target.value })} placeholder="Public, validator-readable evidence" />
        </label>
        <label className="field">
          Evidence hash
          <input className="mono" value={form.evidenceHash} onChange={(e) => setForm({ ...form, evidenceHash: e.target.value })} placeholder="0x…" />
        </label>
      </div>
      {error && <div className="error-note">{error}</div>}
      <TransactionStatusPanel tx={tx} message="Filing challenge. The case will be marked as challenged; prior maps remain visible." />
      <div className="row">
        <button className="btn danger" type="submit" disabled={busy || targets.length === 0}>
          File Challenge
        </button>
        <button className="btn secondary" type="button" onClick={onDone}>Cancel</button>
      </div>
    </form>
  );
}

// ---------------- map history drawer ----------------

function MapHistoryDrawer({ maps, versions }: { maps: ArchivalMap[]; versions: ArchiveVersion[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <div className="panel">
      <div className="panel-title">Map history ({maps.length} prior map{maps.length === 1 ? "" : "s"})</div>
      <div className="stack">
        {maps.map((m) => (
          <div key={m.mapId} className="map-history-item">
            <div className="spread">
              <span>
                <StatusBadge status={m.mapStatus} />{" "}
                <span style={{ fontSize: 12.5, color: "#8B8A84" }}>{fmtDateTime(m.generatedAt)}</span>
              </span>
              <button className="btn secondary small" onClick={() => setOpenId(openId === m.mapId ? null : m.mapId)}>
                {openId === m.mapId ? "Hide" : "View"}
              </button>
            </div>
            {openId === m.mapId && (
              <div style={{ marginTop: 12 }}>
                <ConsensusMapPanel map={m} versions={versions} historical />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
