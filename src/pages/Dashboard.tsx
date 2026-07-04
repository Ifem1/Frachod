import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAppState, refreshAllCases } from "../lib/store";
import { isLiveMode } from "../lib/genlayer";
import { ArchiveCaseCard } from "../components/archive";
import { EmptyState } from "../components/common";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "mapped", label: "Mapped" },
  { key: "challenged", label: "Challenged" },
  { key: "remapping_requested", label: "Remapping requested" },
  { key: "high_uncertainty", label: "High uncertainty" },
  { key: "historical_event", label: "Historical event" },
  { key: "governance_record", label: "Governance record" },
  { key: "community_memory", label: "Community memory" },
  { key: "document_versions", label: "Document versions" },
];

export function Dashboard() {
  const { cases, maps, challenges, versions } = useAppState();
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (isLiveMode()) refreshAllCases();
  }, []);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cases
      .map((c) => {
        const map = maps.filter((m) => m.caseId === c.caseId).sort((a, b) => b.generatedAt - a.generatedAt)[0] ?? null;
        const chCount = challenges.filter((ch) => ch.caseId === c.caseId).length;
        return { c, map, chCount };
      })
      .filter(({ c, map }) => {
        if (filter === "high_uncertainty")
          return map != null && (map.uncertaintyLevel === "high" || map.uncertaintyLevel === "irreducible");
        if (["open", "mapped", "challenged", "remapping_requested"].includes(filter)) return c.status === filter;
        if (filter !== "all") return c.archiveType === filter;
        return true;
      })
      .filter(({ c }) => {
        if (!q) return true;
        const caseVersions = versions.filter((v) => v.caseId === c.caseId);
        return (
          c.title.toLowerCase().includes(q) ||
          c.archiveType.replace(/_/g, " ").includes(q) ||
          c.tags.some((t) => t.toLowerCase().includes(q)) ||
          caseVersions.some(
            (v) =>
              v.versionLabel.toLowerCase().includes(q) ||
              v.sourceType.replace(/_/g, " ").includes(q)
          )
        );
      })
      .sort((a, b) => Math.max(b.c.createdAt, b.map?.generatedAt ?? 0) - Math.max(a.c.createdAt, a.map?.generatedAt ?? 0));
  }, [cases, maps, challenges, versions, filter, query]);

  return (
    <>
      <div className="spread">
        <div>
          <h1 className="page-title">Archive Cases</h1>
          <p className="page-sub">
            Every case is one disputed record family: its versions, its fracture points, and the
            current consensus map.
          </p>
        </div>
        <Link to="/create" className="btn copper">Create Archive Case</Link>
      </div>

      <div className="row" style={{ marginBottom: 16 }}>
        <input
          style={{ minWidth: 280, flex: 1, maxWidth: 420 }}
          placeholder="Search title, archive type, version label, source type…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="row" style={{ marginBottom: 22 }}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={`btn small ${filter === f.key ? "" : "secondary"}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="No fractured archives yet."
          body="Create the first case and begin preserving conflicting records with structure."
          action={<Link to="/create" className="btn copper" style={{ marginTop: 12 }}>Create Archive Case</Link>}
        />
      ) : (
        <div className="grid-cards">
          {items.map(({ c, map, chCount }) => (
            <ArchiveCaseCard key={c.caseId} archiveCase={c} map={map} challengeCount={chCount} />
          ))}
        </div>
      )}
    </>
  );
}
