import { ReactNode, useEffect, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { useAppState, connectWallet, disconnectWallet, resetDemo, restoreWalletIfAuthorized } from "../lib/store";
import { label, shortAddr } from "../lib/labels";
import type { TxHandle } from "../lib/store";
import type { Severity, UncertaintyLevel, ReliabilityLevel } from "../types";

export function Layout({ children }: { children: ReactNode }) {
  const { wallet } = useAppState();
  const [connectError, setConnectError] = useState("");

  useEffect(() => {
    restoreWalletIfAuthorized();
  }, []);

  async function handleConnect() {
    setConnectError("");
    try {
      await connectWallet();
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <>
      <header className="site-header">
        <div className="container">
          <Link to="/" className="brand">
            <span className="brand-mark">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M5 3h10l4 4v14H5z" fill="#F4EFE6" />
                <path d="M8 9l4 2.5-2.5 3L14 18" stroke="#B4473A" strokeWidth="1.6" />
              </svg>
            </span>
            Fractured Archive Resolver
          </Link>
          <nav className="nav-links">
            <NavLink to="/cases">Archive Cases</NavLink>
            <NavLink to="/create">Create Case</NavLink>
            <NavLink to="/settings">Settings</NavLink>
          </nav>
          <div className="header-actions">
            {wallet ? (
              <>
                <span className="badge green">
                  <span className="dot" /> {shortAddr(wallet)}
                </span>
                <button className="btn secondary small" onClick={disconnectWallet}>
                  Disconnect
                </button>
              </>
            ) : (
              <button className="btn small" onClick={handleConnect}>
                Connect Wallet
              </button>
            )}
          </div>
        </div>
        {connectError && (
          <div className="container">
            <div className="error-note" style={{ marginBottom: 10 }}>{connectError}</div>
          </div>
        )}
      </header>
      <main className="container">{children}</main>
      <footer className="site-footer">
        <div className="container spread">
          <span>Fractured Archive Resolver — preserve disagreement without losing structure.</span>
          <span className="row">
            <span>Powered by GenLayer consensus mapping (simulated in this build)</span>
            <button className="btn secondary small" onClick={resetDemo} title="Reset local demo data">
              Reset demo data
            </button>
          </span>
        </div>
      </footer>
    </>
  );
}

// ---------------- badges ----------------

const STATUS_COLOR: Record<string, string> = {
  open: "blue",
  mapping_requested: "amber",
  mapped: "green",
  challenged: "red",
  remapping_requested: "amber",
  closed: "neutral",
  submitted: "blue",
  included_in_map: "green",
  flagged: "red",
  excluded_from_map: "neutral",
  superseded: "neutral",
  resolved_map: "green",
  partial_map: "amber",
  insufficient_evidence: "neutral",
  contested_map: "red",
  requires_more_versions: "neutral",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`badge ${STATUS_COLOR[status] ?? "neutral"}`}>
      <span className="dot" /> {label(status)}
    </span>
  );
}

export function UncertaintyBadge({ level }: { level: UncertaintyLevel | string }) {
  const color =
    level === "low" ? "green" : level === "medium" ? "amber" : level === "high" ? "red" : "copper";
  return (
    <span className={`badge ${color}`} title="Uncertainty level of the current archival map">
      Uncertainty: {label(level)}
    </span>
  );
}

export function ReliabilityBadge({ level }: { level: ReliabilityLevel }) {
  const color = level === "high" ? "green" : level === "medium" ? "amber" : level === "low" ? "red" : "neutral";
  return <span className={`badge ${color}`}>Reliability: {label(level)}</span>;
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  const color =
    severity === "critical" || severity === "major"
      ? "red"
      : severity === "moderate"
      ? "amber"
      : severity === "minor"
      ? "green"
      : "neutral";
  return <span className={`badge ${color}`}>{label(severity)}</span>;
}

export function ConfidenceBadge({ value }: { value: number }) {
  return <span className="badge neutral mono">confidence {value}%</span>;
}

// ---------------- transaction status ----------------

const TX_STEPS: { key: string; text: string }[] = [
  { key: "preparing", text: "Preparing transaction" },
  { key: "wallet_confirmation", text: "Wallet confirmation required" },
  { key: "submitted", text: "Submitted to GenLayer" },
  { key: "awaiting_finalization", text: "Awaiting finalization" },
  { key: "finalized", text: "Finalized" },
];

export function TransactionStatusPanel({ tx, message }: { tx: TxHandle; message?: string }) {
  if (tx.state === "idle") return null;
  if (tx.state === "failed") {
    return (
      <div className="tx-panel">
        <div className="error-note">Transaction failed: {tx.error ?? "unknown error"}</div>
      </div>
    );
  }
  const idx = TX_STEPS.findIndex((s) => s.key === tx.state);
  return (
    <div className="tx-panel">
      {message && <div style={{ fontSize: 13, marginBottom: 6 }}>{message}</div>}
      <div className="tx-steps">
        {TX_STEPS.map((s, i) => (
          <div key={s.key} className={`tx-step ${i < idx ? "done" : i === idx ? "current" : ""}`}>
            {i === idx && tx.state !== "finalized" ? <span className="spinner" /> : <span className="marker" />}
            {s.text}
          </div>
        ))}
      </div>
      {tx.txHash && (
        <div style={{ marginTop: 10 }}>
          <ExplorerLink txHash={tx.txHash} />
        </div>
      )}
    </div>
  );
}

const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

export function ExplorerLink({ txHash }: { txHash: string }) {
  if (!TX_HASH_RE.test(txHash)) {
    // Not a real transaction hash (e.g. a content hash, or a record with no
    // tx reference — GenVM contracts can't see their own tx hash on-chain).
    // Show it as plain reference text instead of a broken explorer link.
    return <span className="mono" title="No transaction hash available for this record">{txHash || "—"}</span>;
  }
  return (
    <a
      className="mono"
      href={`https://explorer.genlayer.com/tx/${txHash}`}
      target="_blank"
      rel="noreferrer"
      title="View on GenLayer explorer"
    >
      {txHash.slice(0, 10)}…{txHash.slice(-6)} ↗
    </a>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <h3 className="serif">{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}
