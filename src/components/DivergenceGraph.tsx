import { useMemo, useState } from "react";
import type { ArchiveVersion, ArchivalMap, DivergencePoint } from "../types";
import { DIVERGENCE_TYPE_LABELS, label } from "../lib/labels";
import { SeverityBadge, ConfidenceBadge } from "./common";

// Versions are laid out on a circle; agreement zones draw green links,
// divergence points draw red/amber fracture links with a marker.

export function DivergenceGraph({
  versions,
  map,
}: {
  versions: ArchiveVersion[];
  map: ArchivalMap | null;
}) {
  const [selected, setSelected] = useState<DivergencePoint | null>(null);

  const W = 720;
  const H = 420;
  const cx = W / 2;
  const cy = H / 2;
  const r = Math.min(W, H) / 2 - 70;

  const pos = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>();
    versions.forEach((v, i) => {
      const a = (i / Math.max(versions.length, 1)) * Math.PI * 2 - Math.PI / 2;
      m.set(v.versionId, { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    });
    return m;
  }, [versions, cx, cy, r]);

  const points = map?.divergencePoints ?? [];
  const zones = map?.agreementZones ?? [];

  function pairsOf(ids: string[]): [string, string][] {
    const out: [string, string][] = [];
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) out.push([ids[i], ids[j]]);
    return out;
  }

  const sevColor = (s: string) =>
    s === "critical" || s === "major" ? "#B4473A" : s === "moderate" ? "#D89A21" : s === "minor" ? "#3F6B57" : "#8B8A84";

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", background: "#FBF8F1", border: "1px solid rgba(37,42,49,0.16)", borderRadius: 10 }}>
        {/* agreement links */}
        {zones.flatMap((z, zi) =>
          pairsOf(z.versionIds).map(([a, b], i) => {
            const pa = pos.get(a);
            const pb = pos.get(b);
            if (!pa || !pb) return null;
            return (
              <line key={`z${zi}-${i}`} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
                stroke="#3F6B57" strokeWidth={2} strokeOpacity={0.28} />
            );
          })
        )}
        {/* divergence links */}
        {points.flatMap((p, pi) =>
          pairsOf(p.affectedVersions).map(([a, b], i) => {
            const pa = pos.get(a);
            const pb = pos.get(b);
            if (!pa || !pb) return null;
            const mx = (pa.x + pb.x) / 2 + (pi - points.length / 2) * 10;
            const my = (pa.y + pb.y) / 2 + (pi - points.length / 2) * 10;
            const active = selected?.pointId === p.pointId;
            return (
              <g key={`p${pi}-${i}`} style={{ cursor: "pointer" }} onClick={() => setSelected(active ? null : p)}>
                <path d={`M ${pa.x} ${pa.y} Q ${mx} ${my} ${pb.x} ${pb.y}`} fill="none"
                  stroke={sevColor(p.severity)} strokeWidth={active ? 3.5 : 2}
                  strokeDasharray={p.severity === "unknown" ? "5 4" : undefined} strokeOpacity={active ? 0.95 : 0.6} />
                <circle cx={mx} cy={my} r={active ? 9 : 7} fill={sevColor(p.severity)} stroke="#FBF8F1" strokeWidth={2} />
                <text x={mx} y={my + 3.5} textAnchor="middle" fontSize={9} fill="#FBF8F1" fontWeight={700}>
                  {pi + 1}
                </text>
              </g>
            );
          })
        )}
        {/* version nodes */}
        {versions.map((v) => {
          const p = pos.get(v.versionId)!;
          const flagged = v.status === "flagged";
          return (
            <g key={v.versionId}>
              <rect x={p.x - 58} y={p.y - 24} width={116} height={48} rx={6}
                fill="#FBF8F1" stroke={flagged ? "#B4473A" : "#252A31"} strokeWidth={1.4} />
              <rect x={p.x - 58} y={p.y - 24} width={5} height={48} fill={flagged ? "#B4473A" : "#A66A3F"} />
              <text x={p.x + 2} y={p.y - 6} textAnchor="middle" fontSize={11} fontWeight={700} fill="#111827">
                {truncate(v.versionLabel.split("—")[0].trim(), 16)}
              </text>
              <text x={p.x + 2} y={p.y + 9} textAnchor="middle" fontSize={9.5} fill="#8B8A84" fontFamily="IBM Plex Mono, monospace">
                {v.contentHash ? v.contentHash.slice(0, 10) + "…" : "no hash"}
              </text>
            </g>
          );
        })}
        {/* legend */}
        <g fontSize={10.5} fill="#252A31">
          <circle cx={20} cy={H - 46} r={5} fill="#B4473A" /><text x={30} y={H - 42}>divergence</text>
          <circle cx={20} cy={H - 28} r={5} fill="#D89A21" /><text x={30} y={H - 24}>uncertainty zone</text>
          <line x1={14} y1={H - 10} x2={26} y2={H - 10} stroke="#3F6B57" strokeWidth={3} strokeOpacity={0.4} />
          <text x={30} y={H - 6}>agreement</text>
        </g>
      </svg>

      {!map && (
        <p style={{ color: "#8B8A84", fontSize: 13, marginTop: 10 }}>
          No consensus map yet — the graph shows submitted versions only. Request archival mapping to reveal fracture lines.
        </p>
      )}

      {selected && <DivergencePointCard point={selected} versions={versions} />}

      {map && !selected && points.length > 0 && (
        <p style={{ color: "#8B8A84", fontSize: 13, marginTop: 10 }}>
          Click a numbered fracture marker to inspect that divergence point.
        </p>
      )}
    </div>
  );
}

export function DivergencePointCard({
  point,
  versions,
}: {
  point: DivergencePoint;
  versions: ArchiveVersion[];
}) {
  const names = point.affectedVersions
    .map((id) => versions.find((v) => v.versionId === id)?.versionLabel ?? id)
    .join(" · ");
  return (
    <div className={`dp-card ${point.severity}`} style={{ marginTop: 12 }}>
      <div className="spread">
        <h4>{DIVERGENCE_TYPE_LABELS[point.divergenceType] ?? label(point.divergenceType)}</h4>
        <span className="row">
          <SeverityBadge severity={point.severity} />
          <ConfidenceBadge value={point.confidence} />
        </span>
      </div>
      <p>{point.summary}</p>
      <p style={{ color: "#8B8A84" }}>
        <b>Affected versions:</b> {names}
      </p>
      {point.evidenceNotes && (
        <p style={{ color: "#8B8A84" }}>
          <b>Evidence notes:</b> {point.evidenceNotes}
        </p>
      )}
    </div>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
