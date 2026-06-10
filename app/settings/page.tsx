"use client";

import { useEffect, useState } from "react";

type Setting = {
  key: string; label: string; group: string; secret: boolean;
  placeholder: string; help: string; value: string; configured?: boolean; fromEnv: boolean;
};
type Account = { id: string; platform: string; displayName: string | null; externalId: string | null; tokenExpiresAt: string | null; createdAt: string };
type CredProvider = { provider: string; fields: { name: string; label: string; type: string; placeholder?: string }[] };

const CONNECTIONS = "Connections";

const OAUTH_PROVIDERS = [
  { id: "meta", label: "Instagram + Facebook", icon: "📘" },
  { id: "linkedin", label: "LinkedIn", icon: "💼" },
  { id: "tiktok", label: "TikTok", icon: "🎵" },
  { id: "google", label: "YouTube", icon: "▶️" },
  { id: "x", label: "X (Twitter)", icon: "𝕏" },
  { id: "threads", label: "Threads", icon: "🧵" },
  { id: "pinterest", label: "Pinterest", icon: "📌" },
  { id: "reddit", label: "Reddit", icon: "👽" },
  { id: "gbp", label: "Google Business", icon: "🏪" },
];
const CRED_LABELS: Record<string, { label: string; icon: string }> = {
  bluesky: { label: "Bluesky", icon: "🦋" },
  mastodon: { label: "Mastodon", icon: "🐘" },
};
const ICONS: Record<string, string> = {
  instagram: "📸", facebook: "📘", linkedin: "💼", tiktok: "🎵", youtube: "▶️",
  x: "𝕏", threads: "🧵", pinterest: "📌", reddit: "👽", gbp: "🏪", bluesky: "🦋", mastodon: "🐘",
};

export default function SettingsPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [fields, setFields] = useState<Setting[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [active, setActive] = useState<string>(CONNECTIONS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  // Connections state
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [credProviders, setCredProviders] = useState<CredProvider[]>([]);
  const [credOpen, setCredOpen] = useState<string | null>(null);
  const [credValues, setCredValues] = useState<Record<string, string>>({});
  const [credBusy, setCredBusy] = useState(false);
  const [banner, setBanner] = useState("");

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        const ok = Boolean(d.authed);
        setAuthed(ok);
        if (!ok) window.location.href = "/";
      })
      .catch(() => setAuthed(false));
  }, []);

  const loadAccounts = () => fetch("/api/social/accounts").then((r) => (r.ok ? r.json() : [])).then((d) => setAccounts(Array.isArray(d) ? d : [])).catch(() => {});
  const loadCredProviders = () => fetch("/api/social/connect-credentials").then((r) => (r.ok ? r.json() : [])).then((d) => setCredProviders(Array.isArray(d) ? d : [])).catch(() => {});

  const load = () => {
    setLoading(true);
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : []))
      .then((d: Setting[]) => {
        const list = Array.isArray(d) ? d : [];
        setFields(list);
        const init: Record<string, string> = {};
        for (const f of list) init[f.key] = f.secret ? "" : f.value || "";
        setValues(init);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!authed) return;
    load();
    loadAccounts();
    loadCredProviders();
    // OAuth callbacks return here with ?connected= / ?social_error=
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const err = params.get("social_error");
    if (connected || err) {
      setBanner(connected ? `✅ Connected ${connected}.` : `⚠️ Connection issue: ${err}`);
      window.history.replaceState({}, "", "/settings");
    }
  }, [authed]);

  async function save() {
    setSaving(true);
    setMsg("");
    const payload: Record<string, string> = {};
    for (const f of fields) {
      const v = values[f.key] ?? "";
      if (f.secret) { if (v.trim() !== "") payload[f.key] = v; }
      else payload[f.key] = v;
    }
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values: payload }),
      });
      setMsg(res.ok ? "✅ Settings saved." : "Could not save settings.");
      if (res.ok) load();
    } catch {
      setMsg("Network error.");
    } finally {
      setSaving(false);
    }
  }

  async function connectCredentials(provider: string) {
    setCredBusy(true);
    setBanner("");
    try {
      const res = await fetch("/api/social/connect-credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, values: credValues }),
      });
      const data = await res.json();
      if (!res.ok) setBanner(`⚠️ Connection issue: ${data?.error || "failed"}`);
      else {
        setBanner(`✅ Connected ${provider}.`);
        setCredOpen(null);
        setCredValues({});
        loadAccounts();
      }
    } catch {
      setBanner("⚠️ Network error.");
    } finally {
      setCredBusy(false);
    }
  }

  async function disconnect(id: string) {
    const res = await fetch(`/api/social/accounts/${id}`, { method: "DELETE" });
    if (res.ok) loadAccounts();
  }

  if (authed === null) {
    return <div style={{ padding: 40, color: "var(--text-dim)" }}>Loading…</div>;
  }

  const groups = [CONNECTIONS, ...Array.from(new Set(fields.map((f) => f.group)))];
  const groupConfigured = (g: string) =>
    g === CONNECTIONS
      ? accounts.length > 0
      : fields.filter((f) => f.group === g).some((f) => f.configured || (f.value && !f.secret));

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 20px 80px" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 900 }}>⚙️ Settings</div>
          <div style={{ color: "var(--text-dim)", fontSize: 14 }}>Connections, API keys, and per-platform credentials. Secrets are stored encrypted.</div>
        </div>
        <a className="btn btn-ghost" href="/" style={{ textDecoration: "none" }}>← Back to studio</a>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 20, alignItems: "start" }}>
        {/* Sidebar */}
        <nav className="panel" style={{ padding: 10, position: "sticky", top: 20 }}>
          <div style={{ display: "grid", gap: 2 }}>
            {groups.map((g) => {
              const on = g === active;
              return (
                <button
                  key={g}
                  onClick={() => setActive(g)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                    textAlign: "left", padding: "10px 12px", borderRadius: 9, fontSize: 13, fontWeight: 700,
                    cursor: "pointer", border: "none",
                    background: on ? "var(--accent)" : "transparent",
                    color: on ? "white" : "var(--text)",
                  }}
                >
                  <span>{g === CONNECTIONS ? "🔗 Connections" : g}</span>
                  {groupConfigured(g) && <span style={{ width: 7, height: 7, borderRadius: 99, background: on ? "white" : "var(--accent-2)" }} />}
                </button>
              );
            })}
          </div>
        </nav>

        {/* Content */}
        <div className="panel">
          {active === CONNECTIONS ? (
            <div style={{ display: "grid", gap: 14 }}>
              <div style={{ fontWeight: 800, fontSize: 16 }}>🔗 Connections</div>
              <p style={{ color: "var(--text-dim)", fontSize: 13, margin: 0 }}>Connect each platform once. Tokens are stored encrypted. Configure each platform&apos;s app credentials in its section on the left first.</p>
              {banner && (
                <div className="panel" style={{ padding: "10px 14px", borderColor: banner.startsWith("✅") ? "var(--accent-2)" : "var(--danger)" }}>{banner}</div>
              )}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {OAUTH_PROVIDERS.map((p) => (
                  <a key={p.id} className="btn btn-ghost" href={`/api/social/connect/${p.id}`} style={{ textDecoration: "none" }}>{p.icon} Connect {p.label}</a>
                ))}
                {credProviders.map((p) => {
                  const meta = CRED_LABELS[p.provider] || { label: p.provider, icon: "📣" };
                  return (
                    <button key={p.provider} className="btn btn-ghost" onClick={() => { setCredOpen(credOpen === p.provider ? null : p.provider); setCredValues({}); }}>
                      {meta.icon} Connect {meta.label}
                    </button>
                  );
                })}
              </div>
              {credOpen && (() => {
                const p = credProviders.find((c) => c.provider === credOpen);
                if (!p) return null;
                const meta = CRED_LABELS[p.provider] || { label: p.provider, icon: "📣" };
                return (
                  <div style={{ display: "grid", gap: 8, padding: 12, borderRadius: 10, border: "1px solid var(--border)", background: "var(--panel-2)" }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{meta.icon} Connect {meta.label}</div>
                    {p.fields.map((f) => (
                      <input
                        key={f.name}
                        className="input"
                        type={f.type === "password" ? "password" : "text"}
                        placeholder={f.placeholder || f.label}
                        value={credValues[f.name] || ""}
                        onChange={(e) => setCredValues((v) => ({ ...v, [f.name]: e.target.value }))}
                      />
                    ))}
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="btn btn-primary" disabled={credBusy} onClick={() => connectCredentials(p.provider)}>{credBusy ? "Connecting…" : "Connect"}</button>
                      <button className="btn btn-ghost" onClick={() => { setCredOpen(null); setCredValues({}); }}>Cancel</button>
                    </div>
                  </div>
                );
              })()}
              {accounts.length > 0 ? (
                <div style={{ display: "grid", gap: 8 }}>
                  <div className="tag">Connected accounts</div>
                  {accounts.map((a) => (
                    <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--panel-2)" }}>
                      <span style={{ fontSize: 18 }}>{ICONS[a.platform] || "📣"}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, textTransform: "capitalize" }}>{a.platform}</div>
                        <div style={{ fontSize: 12, color: "var(--text-dim)" }}>{a.displayName || a.externalId}</div>
                      </div>
                      <button className="btn btn-ghost" style={{ color: "var(--danger)", padding: "6px 12px" }} onClick={() => disconnect(a.id)}>Disconnect</button>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: "var(--text-dim)", fontSize: 13 }}>No accounts connected yet.</p>
              )}
            </div>
          ) : loading ? (
            <div style={{ color: "var(--text-dim)", padding: 20 }}>Loading…</div>
          ) : (
            <div style={{ display: "grid", gap: 14 }}>
              <div style={{ fontWeight: 800, fontSize: 16 }}>{active}</div>
              {fields.filter((f) => f.group === active).map((f) => (
                <div key={f.key}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, marginBottom: 5 }}>
                    {f.label}
                    {f.secret && f.configured && <span style={{ fontSize: 11, color: "var(--accent-2)", fontWeight: 700 }}>configured ✓</span>}
                    {f.fromEnv && <span style={{ fontSize: 11, color: "var(--text-dim)", fontWeight: 700 }}>from env</span>}
                  </label>
                  <input
                    className="input"
                    type={f.secret ? "password" : "text"}
                    placeholder={f.secret && f.configured ? "•••••••• (leave blank to keep)" : f.placeholder}
                    value={values[f.key] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  />
                  {f.help && <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>{f.help}</div>}
                </div>
              ))}

              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
                <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save settings"}</button>
                {msg && <span style={{ fontSize: 13, color: msg.startsWith("✅") ? "var(--accent-2)" : "var(--danger)" }}>{msg}</span>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
