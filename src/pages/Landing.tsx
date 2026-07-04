import { Link } from "react-router-dom";
import { useAppState } from "../lib/store";

export function Landing() {
  const { cases } = useAppState();
  const demo = cases[0];
  return (
    <>
      <section className="hero">
        <div>
          <div className="hero-kicker">A conflict-aware archival intelligence layer</div>
          <h1>Preserve disagreement without losing structure.</h1>
          <p className="lede">
            Fractured Archive Resolver helps communities, researchers, DAOs, and institutions map
            conflicting versions of records into a visible archive of divergence, timeline,
            evidence, and uncertainty.
          </p>
          <div className="row">
            <Link to="/create" className="btn copper">Create Archive Case</Link>
            {demo && (
              <Link to={`/cases/${demo.caseId}`} className="btn secondary">
                Explore Demo Archive
              </Link>
            )}
          </div>
        </div>
        <HeroVisual />
      </section>

      <section className="section">
        <h2>Why archives fracture</h2>
        <div className="feature-grid">
          <Feature title="Records get edited" body="Announcements are softened, dates shift, obligations become suggestions. The original often survives only as a screenshot." />
          <Feature title="Memory drifts honestly" body="Two truthful witnesses can remember one event differently. Neither account deserves deletion." />
          <Feature title="Institutions revise" body="Summaries reframe originals. Translations shift meaning. Provenance chains break quietly." />
          <Feature title="Tampering happens" body="Sometimes a version really was forged — but that conclusion needs evidence, not a vote." />
        </div>
      </section>

      <section className="section">
        <h2>How GenLayer maps conflict</h2>
        <div className="feature-grid">
          <Feature title="1 · Submit versions" body="Each conflicting record is locked into the case with a content hash, source chain, and claimed metadata." />
          <Feature title="2 · Validators compare" body="GenLayer validators interpret the versions — timeline, transformations, reliability — and reach consensus on a canonical archival map." />
          <Feature title="3 · Divergence is mapped" body="Agreement zones, fracture points, likely evolution, and an explicit uncertainty level. Not a single truth label." />
          <Feature title="4 · Anyone can challenge" body="New evidence triggers remapping. Old maps are never deleted — interpretive history is part of the archive." />
        </div>
      </section>

      <section className="section">
        <h2>What gets preserved</h2>
        <div className="feature-grid">
          <Feature title="Every meaningful version" body="Minority versions stay visible when they are historically meaningful." />
          <Feature title="The relationships" body="Which version likely came first, what changed, and what kind of change it was." />
          <Feature title="The uncertainty" body="Low, medium, high, or irreducible — stated plainly, never hidden." />
          <Feature title="The interpretive record" body="Every prior map remains readable. The archive remembers how it was read." />
        </div>
      </section>

      <section className="section">
        <h2>Built for uncertainty, not erasure</h2>
        <p style={{ maxWidth: 720, color: "#252A31" }}>
          Historians, archivists, DAO record keepers, investigative teams, journalists, dispute
          resolution teams, and community memory groups all face the same problem: multiple
          sources of truth. Fractured Archive Resolver does not pick a winner. It makes
          contradiction readable — and keeps it that way.
        </p>
        <div className="row" style={{ marginTop: 18 }}>
          <Link to="/cases" className="btn">Browse Archive Cases</Link>
        </div>
      </section>
    </>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="panel">
      <h3>{title}</h3>
      <p style={{ margin: 0, fontSize: 13.5, color: "#252A31" }}>{body}</p>
    </div>
  );
}

function HeroVisual() {
  return (
    <svg viewBox="0 0 420 320" style={{ width: "100%" }}>
      {/* layered offset documents */}
      {[
        { x: 44, y: 46, rot: -4 },
        { x: 74, y: 36, rot: 0 },
        { x: 104, y: 26, rot: 4 },
      ].map((d, i) => (
        <g key={i} transform={`rotate(${d.rot} ${d.x + 70} ${d.y + 90})`}>
          <rect x={d.x} y={d.y} width={140} height={180} rx={4} fill="#FBF8F1" stroke="#252A31" strokeWidth={1.2} />
          <rect x={d.x} y={d.y} width={6} height={180} fill="#A66A3F" />
          {[0, 1, 2, 3, 4, 5].map((l) => (
            <rect key={l} x={d.x + 16} y={d.y + 22 + l * 22} width={i === 1 && l === 2 ? 60 : 104} height={6} rx={3}
              fill={i === 2 && l === 2 ? "#B4473A" : "#8B8A84"} opacity={i === 2 && l === 2 ? 0.8 : 0.35} />
          ))}
        </g>
      ))}
      {/* fracture lines */}
      <path d="M 150 90 l 22 14 -14 18 26 20" stroke="#B4473A" strokeWidth={2.5} fill="none" />
      <path d="M 180 160 l 18 10 -10 16 22 14" stroke="#B4473A" strokeWidth={2} fill="none" opacity={0.7} />
      {/* timeline thread */}
      <path d="M 60 260 C 140 236, 250 250, 360 226" stroke="#A66A3F" strokeWidth={2} fill="none" strokeDasharray="1 0" />
      {[70, 170, 270, 350].map((x, i) => (
        <circle key={i} cx={x} cy={260 - i * 9 - (i === 3 ? 6 : 0)} r={6} fill="#FBF8F1" stroke="#A66A3F" strokeWidth={2.4} />
      ))}
      {/* consensus panel */}
      <rect x={288} y={40} width={112} height={150} rx={8} fill="#111827" />
      <text x={300} y={64} fill="#F4EFE6" fontSize={10} fontFamily="IBM Plex Mono, monospace">consensus map</text>
      {[
        ["#3F6B57", 80], ["#3F6B57", 98], ["#D89A21", 116], ["#B4473A", 134], ["#B4473A", 152], ["#8B8A84", 170],
      ].map(([c, y], i) => (
        <g key={i}>
          <circle cx={302} cy={y as number} r={4} fill={c as string} />
          <rect x={314} y={(y as number) - 3} width={i % 2 ? 50 : 72} height={6} rx={3} fill="#F4EFE6" opacity={0.35} />
        </g>
      ))}
    </svg>
  );
}
