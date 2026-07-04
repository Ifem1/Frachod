import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppState, createArchiveCase, connectWallet, TxHandle } from "../lib/store";
import { ARCHIVE_TYPES } from "../lib/labels";
import { TransactionStatusPanel } from "../components/common";
import type { ArchiveType } from "../types";

export function CreateCase() {
  const nav = useNavigate();
  const { wallet } = useAppState();
  const [tx, setTx] = useState<TxHandle>({ state: "idle" });
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    title: "",
    archiveType: "document_versions" as ArchiveType,
    description: "",
    fullContext: "",
    caseContextUri: "",
    tags: "",
    visibility: "public" as "public" | "unlisted",
  });
  const busy = tx.state !== "idle" && tx.state !== "failed";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      if (!wallet) await connectWallet();
      const caseId = await createArchiveCase(
        {
          title: form.title,
          description: form.description,
          fullContext: form.fullContext,
          archiveType: form.archiveType,
          caseContextUri: form.caseContextUri,
          tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
          visibility: form.visibility,
        },
        setTx
      );
      nav(`/cases/${caseId}?submitted=1`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setTx({ state: "idle" });
    }
  }

  const upd = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm({ ...form, [k]: e.target.value });

  return (
    <div style={{ maxWidth: 780 }}>
      <h1 className="page-title">Create Archive Case</h1>
      <p className="page-sub">Open a new case for one disputed record family.</p>

      <div className="guidance" style={{ marginBottom: 20 }}>
        An archive case should represent one disputed record family, not one isolated document.
        <br />
        Example: “Versions of the January governance promise” is better than “Screenshot 1.”
      </div>

      <form onSubmit={onSubmit} className="stack">
        <div className="form-grid">
          <label className="field full">
            Case title
            <input required value={form.title} onChange={upd("title")} placeholder="e.g. January DAO Grant Promise Versions" />
          </label>
          <label className="field">
            Archive type
            <select value={form.archiveType} onChange={upd("archiveType")}>
              {ARCHIVE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </label>
          <label className="field">
            Visibility
            <select value={form.visibility} onChange={upd("visibility")}>
              <option value="public">Public</option>
              <option value="unlisted">Unlisted</option>
            </select>
          </label>
          <label className="field full">
            Short description
            <span className="hint">One or two sentences explaining what the versions disagree about.</span>
            <input required value={form.description} onChange={upd("description")} />
          </label>
          <label className="field full">
            Full context
            <span className="hint">Background a reader needs to understand the dispute. Validators receive this context.</span>
            <textarea value={form.fullContext} onChange={upd("fullContext")} />
          </label>
          <label className="field">
            Context URI
            <span className="hint">Points to context metadata, not private evidence.</span>
            <input value={form.caseContextUri} onChange={upd("caseContextUri")} placeholder="ipfs://… or https://…" />
          </label>
          <label className="field">
            Tags
            <span className="hint">Comma separated.</span>
            <input value={form.tags} onChange={upd("tags")} placeholder="dao, governance, edited-post" />
          </label>
        </div>

        {error && <div className="error-note">{error}</div>}
        <TransactionStatusPanel tx={tx} message="Your archive case is being created." />

        <div className="row">
          <button className="btn copper" disabled={busy} type="submit">
            {wallet ? "Create Archive Case" : "Connect Wallet & Create"}
          </button>
        </div>
      </form>
    </div>
  );
}
