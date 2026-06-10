"use client";

import { useEffect, useState } from "react";

type Setting = {
  key: string; label: string; group: string; secret: boolean;
  placeholder: string; help: string; value: string; configured?: boolean; fromEnv: boolean;
};

export default function SettingsPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [fields, setFields] = useState<Setting[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [active, setActive] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

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
        if (list.length) setActive((a) => a || list[0].group);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    if (authed) load();
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

  if (authed === null) {
    return <div style={{ padding: 40, color: "var(--text-dim)" }}>Loading…</div>;
  }

  const groups = Array.from(new Set(fields.map((f) => f.group)));
  const groupConfigured = (g: string) =>
    fields.filter((f) => f.group === g).some((f) => f.configured || (f.value && !f.secret));

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 20px 80px" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 900 }}>⚙️ Settings</div>
          <div style={{ color: "var(--text-dim)", fontSize: 14 }}>API keys and per-platform credentials. Secrets are stored encrypted.</div>
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
                  <span>{g}</span>
                  {groupConfigured(g) && <span style={{ width: 7, height: 7, borderRadius: 99, background: on ? "white" : "var(--accent-2)" }} />}
                </button>
              );
            })}
          </div>
        </nav>

        {/* Fields for the active group */}
        <div className="panel">
          {loading ? (
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
