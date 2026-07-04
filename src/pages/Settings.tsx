import { useState } from "react";
import { useAppState, connectWallet, disconnectWallet, resetDemo } from "../lib/store";
import { shortAddr } from "../lib/labels";
import { CONTRACT_ADDRESS, isLiveMode } from "../lib/genlayer";

export function Settings() {
  const { wallet, cases, versions, maps, challenges } = useAppState();
  const [error, setError] = useState("");

  async function handleConnect() {
    setError("");
    try {
      await connectWallet();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div style={{ maxWidth: 680 }}>
      <h1 className="page-title">Settings</h1>
      <p className="page-sub">Wallet, network, and local demo data.</p>

      <div className="stack">
        <div className="panel">
          <div className="panel-title">Connected wallet</div>
          {wallet ? (
            <>
              <p className="mono" style={{ wordBreak: "break-all" }}>{wallet}</p>
              <p style={{ fontSize: 13, color: "#8B8A84" }}>
                Displayed as {shortAddr(wallet)}.{" "}
                {isLiveMode()
                  ? "This is your own injected wallet (e.g. MetaMask); it signs real transactions against the deployed contract directly."
                  : "This build simulates a wallet locally — no real keys or funds are involved."}
              </p>
              <button className="btn secondary" onClick={disconnectWallet}>Disconnect</button>
            </>
          ) : (
            <>
              <p style={{ fontSize: 13, color: "#8B8A84" }}>
                Connect a wallet to create cases, submit versions, request mappings, and file challenges.
                {isLiveMode() && " This requires a wallet extension (e.g. MetaMask) installed in your browser."}
              </p>
              <button className="btn" onClick={handleConnect}>Connect Wallet</button>
              {error && <div className="error-note" style={{ marginTop: 10 }}>{error}</div>}
            </>
          )}
        </div>

        <div className="panel">
          <div className="panel-title">Network</div>
          <div className="kv">
            <b>Mode</b>
            <span>{isLiveMode() ? "Live (GenLayer contract wired)" : "Simulated (no contract address set)"}</span>
          </div>
          <div className="kv">
            <b>Contract address</b>
            <span className="mono" style={{ wordBreak: "break-all" }}>
              {CONTRACT_ADDRESS || "not set — add VITE_GENLAYER_CONTRACT_ADDRESS to .env"}
            </span>
          </div>
          <div className="kv"><b>Source</b><span className="mono">contracts/fractured_archive_resolver.py</span></div>
          <div className="kv"><b>Consensus</b><span>Non-deterministic archival mapping with canonical JSON equality</span></div>
          {isLiveMode() && (
            <p style={{ fontSize: 13, color: "#8B8A84" }}>
              Reads and writes go directly to this deployed contract via genlayer-js 1.1.8. Note:
              the on-chain contract only stores title/description/archive type/context URI for a
              case — tags, visibility, and full context beyond the description are frontend-only
              and are not persisted on-chain.
            </p>
          )}
        </div>

        <div className="panel">
          <div className="panel-title">{isLiveMode() ? "Cached chain data" : "Local archive data"}</div>
          <div className="kv"><b>Cases</b><span>{cases.length}</span></div>
          <div className="kv"><b>Versions</b><span>{versions.length}</span></div>
          <div className="kv"><b>Maps</b><span>{maps.length}</span></div>
          <div className="kv"><b>Challenges</b><span>{challenges.length}</span></div>
          <p style={{ fontSize: 13, color: "#8B8A84" }}>
            {isLiveMode()
              ? "This is a local cache of contract reads. Clearing it does not affect on-chain data — the next visit to a case re-fetches it."
              : "Data is stored in your browser's localStorage. Resetting restores the demo archive case."}
          </p>
          <button
            className="btn danger"
            onClick={() => {
              if (confirm(isLiveMode() ? "Clear the local chain-data cache?" : "Reset all local data to the demo state?"))
                resetDemo();
            }}
          >
            {isLiveMode() ? "Clear local cache" : "Reset demo data"}
          </button>
        </div>
      </div>
    </div>
  );
}
