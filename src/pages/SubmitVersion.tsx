import { FormEvent, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useAppState, submitVersion, connectWallet, TxHandle } from "../lib/store";
import { SOURCE_TYPES } from "../lib/labels";
import { TransactionStatusPanel } from "../components/common";
import { fakeHash } from "../lib/mapper";
import type { SourceType } from "../types";

export function SubmitVersion() {
  const { caseId = "" } = useParams();
  const nav = useNavigate();
  const { wallet, cases } = useAppState();
  const archiveCase = cases.find((c) => c.caseId === caseId);
  const [tx, setTx] = useState<TxHandle>({ state: "idle" });
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    title: "",
    versionLabel: "",
    contentUri: "",
    contentHash: "",
    sourceUri: "",
    sourceType: "primary_document" as SourceType,
    claimedAuthor: "",
    claimedDate: "",
    language: "en",
    metadataUri: "",
    notes: "",
  });
  const busy = tx.state !== "idle" && tx.state !== "failed";

  if (!archiveCase) {
    return (
      <div className="empty-state" style={{ marginTop: 40 }}>
        <h3>Case not found</h3>
        <Link to="/cases" className="btn secondary">Back to Archive Cases</Link>
      </div>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      if (!wallet) await connectWallet();
      await submitVersion({ caseId, ...form }, setTx);
      nav(`/cases/${caseId}?tab=versions`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setTx({ state: "idle" });
    }
  }

  const upd = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm({ ...form, [k]: e.target.value });

  return (
    <div style={{ maxWidth: 780 }}>
      <h1 className="page-title">Submit Version</h1>
      <p className="page-sub">
        Add one record to <Link to={`/cases/${caseId}`}>{archiveCase.title}</Link>. The content
        hash locks this version into the archive.
      </p>

      <div className="warning-note" style={{ marginBottom: 20 }}>
        Only submit records that validators can access or verify through public evidence. Private
        files may not be usable for consensus mapping.
      </div>

      <form onSubmit={onSubmit} className="stack">
        <div className="form-grid">
          <label className="field full">
            Version title
            <span className="hint">Describe what this version says — e.g. “Original screenshot says grants are guaranteed.”</span>
            <input required value={form.title} onChange={upd("title")} />
          </label>
          <label className="field">
            Version label
            <input value={form.versionLabel} onChange={upd("versionLabel")} placeholder="e.g. Version A — Original screenshot" />
          </label>
          <label className="field">
            Source type
            <select value={form.sourceType} onChange={upd("sourceType")}>
              {SOURCE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </label>
          <label className="field">
            Content URI
            <input value={form.contentUri} onChange={upd("contentUri")} placeholder="ipfs://… or https://…" />
          </label>
          <label className="field">
            Content hash
            <span className="hint">
              SHA-256 of the content.{" "}
              <a
                href="#"
                onClick={async (e) => {
                  e.preventDefault();
                  setForm((f) => ({ ...f, contentHash: "" }));
                  const h = await fakeHash(form.title + form.contentUri + Date.now());
                  setForm((f) => ({ ...f, contentHash: h }));
                }}
              >
                Generate from fields
              </a>
            </span>
            <input value={form.contentHash} onChange={upd("contentHash")} placeholder="0x…" className="mono" />
          </label>
          <label className="field">
            Source URI
            <input value={form.sourceUri} onChange={upd("sourceUri")} placeholder="Where this record lives or was captured from" />
          </label>
          <label className="field">
            Metadata URI
            <input value={form.metadataUri} onChange={upd("metadataUri")} placeholder="Optional metadata document" />
          </label>
          <label className="field">
            Claimed author
            <input value={form.claimedAuthor} onChange={upd("claimedAuthor")} />
          </label>
          <label className="field">
            Claimed date
            <input type="date" value={form.claimedDate} onChange={upd("claimedDate")} />
          </label>
          <label className="field">
            Language
            <input value={form.language} onChange={upd("language")} placeholder="en" />
          </label>
          <label className="field full">
            Notes
            <span className="hint">Anything a validator or reader should know about this version's provenance.</span>
            <textarea value={form.notes} onChange={upd("notes")} />
          </label>
        </div>

        {error && <div className="error-note">{error}</div>}
        <TransactionStatusPanel tx={tx} message="This version is being locked into the archive record." />

        <div className="row">
          <button className="btn copper" disabled={busy} type="submit">
            {wallet ? "Submit Version" : "Connect Wallet & Submit"}
          </button>
          <Link to={`/cases/${caseId}`} className="btn secondary">Cancel</Link>
        </div>
      </form>
    </div>
  );
}
