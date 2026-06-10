"use client";

import { useEffect, useState, type FormEvent } from "react";

type Target = { platform: string; status: string; remoteUrl: string | null; error: string | null };
type Post = { id: string; prompt: string; caption: string; status: string; createdAt: string; scheduledAt?: string | null; imageUrl: string | null; videoUrl?: string | null; targets?: Target[] };
type Account = { id: string; platform: string; displayName: string | null; externalId: string | null; tokenExpiresAt: string | null; createdAt: string };

const PROVIDERS = [
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
type CredProvider = { provider: string; fields: { name: string; label: string; type: string; placeholder?: string }[] };
const CRED_LABELS: Record<string, { label: string; icon: string }> = {
  bluesky: { label: "Bluesky", icon: "🦋" },
  mastodon: { label: "Mastodon", icon: "🐘" },
};
const ICONS: Record<string, string> = {
  instagram: "📸", facebook: "📘", linkedin: "💼", tiktok: "🎵", youtube: "▶️",
  x: "𝕏", threads: "🧵", pinterest: "📌", reddit: "👽", gbp: "🏪", bluesky: "🦋", mastodon: "🐘",
};

export default function Home() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setAuthed(Boolean(d.authed)))
      .catch(() => setAuthed(false));
  }, []);

  async function login(e: FormEvent) {
    e.preventDefault();
    setLoginError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) setAuthed(true);
    else setLoginError("Incorrect password.");
  }

  if (authed === null) {
    return <div style={{ padding: 40, color: "var(--text-dim)" }}>Loading…</div>;
  }

  if (!authed) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20 }}>
        <form onSubmit={login} className="panel" style={{ width: 360 }}>
          <div style={{ fontSize: 24, fontWeight: 900, marginBottom: 4 }}>🚀 SocialSync</div>
          <p style={{ color: "var(--text-dim)", fontSize: 14, marginTop: 0, marginBottom: 18 }}>Sign in to continue.</p>
          <input className="input" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
          <button className="btn btn-primary" style={{ width: "100%", marginTop: 14 }} type="submit">Sign in</button>
          {loginError && <div style={{ color: "var(--danger)", fontSize: 13, marginTop: 12 }}>{loginError}</div>}
        </form>
      </div>
    );
  }

  return <Studio onLogout={() => setAuthed(false)} />;
}

type Setting = {
  key: string; label: string; group: string; secret: boolean;
  placeholder: string; help: string; value: string; configured?: boolean; fromEnv: boolean;
};

function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [fields, setFields] = useState<Setting[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

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
  useEffect(load, []);

  async function save() {
    setSaving(true);
    setMsg("");
    // Send non-secret values always; secrets only when the operator typed something.
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

  const groups = Array.from(new Set(fields.map((f) => f.group)));

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "grid", placeItems: "start center", padding: "40px 16px", overflowY: "auto", zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} className="panel" style={{ width: "min(720px, 100%)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ fontSize: 20, fontWeight: 900 }}>⚙️ Settings</div>
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
        </div>
        <p style={{ color: "var(--text-dim)", fontSize: 13, marginTop: 0 }}>
          API keys and per-platform credentials. Secrets are stored encrypted. Supabase keys, the
          login password and token secret stay in the environment.
        </p>

        {loading ? (
          <div style={{ color: "var(--text-dim)", padding: 20 }}>Loading…</div>
        ) : (
          <div style={{ display: "grid", gap: 18 }}>
            {groups.map((group) => (
              <div key={group}>
                <div className="tag" style={{ marginBottom: 8 }}>{group}</div>
                <div style={{ display: "grid", gap: 10 }}>
                  {fields.filter((f) => f.group === group).map((f) => (
                    <div key={f.key}>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
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
                      {f.help && <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 3 }}>{f.help}</div>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 20 }}>
          <button className="btn btn-primary" onClick={save} disabled={saving || loading}>{saving ? "Saving…" : "Save settings"}</button>
          {msg && <span style={{ fontSize: 13, color: msg.startsWith("✅") ? "var(--accent-2)" : "var(--danger)" }}>{msg}</span>}
        </div>
      </div>
    </div>
  );
}

function Studio({ onLogout }: { onLogout: () => void }) {
  const [prompt, setPrompt] = useState("");
  const [tone, setTone] = useState("");
  const [generating, setGenerating] = useState(false);
  const [msg, setMsg] = useState("");
  const [banner, setBanner] = useState("");
  const [draft, setDraft] = useState<Post | null>(null);
  const [captionEdit, setCaptionEdit] = useState("");
  const [savingCaption, setSavingCaption] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [scheduleAt, setScheduleAt] = useState("");
  const [posts, setPosts] = useState<Post[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [credProviders, setCredProviders] = useState<CredProvider[]>([]);
  const [credOpen, setCredOpen] = useState<string | null>(null);
  const [credValues, setCredValues] = useState<Record<string, string>>({});
  const [credBusy, setCredBusy] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const loadPosts = () => fetch("/api/social/posts").then((r) => (r.ok ? r.json() : [])).then((d) => setPosts(Array.isArray(d) ? d : [])).catch(() => {});
  const loadAccounts = () => fetch("/api/social/accounts").then((r) => (r.ok ? r.json() : [])).then((d) => setAccounts(Array.isArray(d) ? d : [])).catch(() => {});
  const loadCredProviders = () => fetch("/api/social/connect-credentials").then((r) => (r.ok ? r.json() : [])).then((d) => setCredProviders(Array.isArray(d) ? d : [])).catch(() => {});

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

  useEffect(() => {
    loadPosts();
    loadAccounts();
    loadCredProviders();
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const err = params.get("social_error");
    if (connected || err) {
      setBanner(connected ? `✅ Connected ${connected}.` : `⚠️ Connection issue: ${err}`);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  async function generate(e: FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;
    setGenerating(true);
    setMsg("");
    setDraft(null);
    try {
      const res = await fetch("/api/social/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, tone: tone || undefined }),
      });
      const data = await res.json();
      if (!res.ok) setMsg(data?.error || "Generation failed.");
      else {
        setDraft(data.post);
        setCaptionEdit(data.post.caption || "");
        setMsg("✅ Draft generated.");
        loadPosts();
      }
    } catch {
      setMsg("Network error.");
    } finally {
      setGenerating(false);
    }
  }

  async function uploadMedia(file: File) {
    setUploading(true);
    setMsg("");
    setDraft(null);
    try {
      const body = new FormData();
      body.append("file", file);
      if (prompt.trim()) body.append("prompt", prompt.trim());
      const res = await fetch("/api/social/upload", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) setMsg(data?.error || "Upload failed.");
      else {
        setDraft(data.post);
        setCaptionEdit(data.post.caption || "");
        setMsg("✅ Media uploaded. Add a caption below.");
        loadPosts();
      }
    } catch {
      setMsg("Network error.");
    } finally {
      setUploading(false);
    }
  }

  async function saveCaption() {
    if (!draft) return;
    setSavingCaption(true);
    try {
      const res = await fetch(`/api/social/posts/${draft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caption: captionEdit }),
      });
      setMsg(res.ok ? "✅ Caption saved." : "Could not save caption.");
      if (res.ok) loadPosts();
    } finally {
      setSavingCaption(false);
    }
  }

  async function publish() {
    if (!draft || selected.length === 0) return;
    const scheduledAt = scheduleAt ? new Date(scheduleAt).toISOString() : undefined;
    if (scheduledAt && new Date(scheduledAt).getTime() <= Date.now()) {
      setMsg("Pick a time in the future to schedule.");
      return;
    }
    setPublishing(true);
    setMsg("");
    try {
      const res = await fetch(`/api/social/posts/${draft.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountIds: selected, scheduledAt }),
      });
      const data = await res.json();
      if (!res.ok) setMsg(data?.error || "Publish failed.");
      else if (data.scheduled) {
        setMsg(`🗓️ Scheduled for ${new Date(data.scheduledAt).toLocaleString()}.`);
        setScheduleAt("");
        loadPosts();
      } else {
        const ok = (data.targets || []).filter((t: Target) => t.status === "published").length;
        const processing = (data.targets || []).filter((t: Target) => t.status === "processing").length;
        const failed = (data.targets || []).filter((t: Target) => t.status === "failed");
        const parts: string[] = [];
        if (ok) parts.push(`published to ${ok}`);
        if (processing) parts.push(`${processing} processing`);
        if (failed.length) parts.push(`failed: ${failed.map((t: Target) => `${t.platform} (${t.error})`).join("; ")}`);
        setMsg((failed.length ? "" : "✅ ") + (parts.join(" · ") || "Done."));
        loadPosts();
      }
    } catch {
      setMsg("Network error.");
    } finally {
      setPublishing(false);
    }
  }

  async function disconnect(id: string) {
    const res = await fetch(`/api/social/accounts/${id}`, { method: "DELETE" });
    if (res.ok) {
      setSelected((c) => c.filter((x) => x !== id));
      loadAccounts();
    }
  }

  async function remove(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/social/posts/${id}`, { method: "DELETE" });
      if (res.ok) {
        if (draft?.id === id) setDraft(null);
        loadPosts();
      }
    } finally {
      setDeletingId(null);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    onLogout();
  }

  const toggle = (id: string) => setSelected((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 20px 80px" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 900 }}>🚀 SocialSync</div>
          <div style={{ color: "var(--text-dim)", fontSize: 14 }}>Describe a post → AI caption + image → publish everywhere.</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-ghost" onClick={() => setShowSettings(true)}>⚙️ Settings</button>
          <button className="btn btn-ghost" onClick={logout}>Sign out</button>
        </div>
      </header>

      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}

      {banner && (
        <div className="panel" style={{ marginBottom: 20, padding: "12px 16px", borderColor: banner.startsWith("✅") ? "var(--accent-2)" : "var(--danger)" }}>{banner}</div>
      )}

      {/* Connections */}
      <div className="panel" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>🔗 Connections</div>
        <p style={{ color: "var(--text-dim)", fontSize: 13, marginTop: 0, marginBottom: 14 }}>Connect each platform once. Tokens are stored encrypted.</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
          {PROVIDERS.map((p) => (
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
            <div style={{ display: "grid", gap: 8, padding: 12, marginBottom: 16, borderRadius: 10, border: "1px solid var(--border)", background: "var(--panel-2)" }}>
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
        {accounts.length > 0 && (
          <div style={{ display: "grid", gap: 8 }}>
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
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>
        {/* Compose */}
        <form className="panel" onSubmit={generate}>
          <div style={{ fontWeight: 800, marginBottom: 14 }}>✍️ Describe your post</div>
          <div className="tag" style={{ marginBottom: 6 }}>Description</div>
          <textarea className="textarea" rows={5} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="e.g. Weekend special: buy-one-get-one on all lattes, photo of a cozy coffee setup." style={{ resize: "vertical" }} />
          <div className="tag" style={{ margin: "14px 0 6px" }}>Tone (optional)</div>
          <input className="input" value={tone} onChange={(e) => setTone(e.target.value)} placeholder="warm and playful, urgent, professional…" />
          <button className="btn btn-primary" style={{ marginTop: 16 }} type="submit" disabled={generating || uploading || !prompt.trim()}>{generating ? "Generating…" : "✨ Generate post"}</button>

          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "16px 0 6px", color: "var(--text-dim)", fontSize: 12 }}>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            or upload your own
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          </div>
          <label className="btn btn-ghost" style={{ cursor: uploading ? "default" : "pointer" }}>
            {uploading ? "Uploading…" : "📎 Upload photo or video"}
            <input
              type="file"
              accept="image/*,video/*"
              hidden
              disabled={uploading}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadMedia(f); e.target.value = ""; }}
            />
          </label>

          {msg && <div style={{ marginTop: 14, fontSize: 13, color: msg.startsWith("✅") || msg.startsWith("🗓️") ? "var(--accent-2)" : "var(--danger)" }}>{msg}</div>}
        </form>

        {/* Preview */}
        <div className="panel">
          <div style={{ fontWeight: 800, marginBottom: 14 }}>👀 Preview</div>
          {!draft && <p style={{ color: "var(--text-dim)", fontSize: 13 }}>Your generated post will appear here.</p>}
          {draft && (
            <div>
              {draft.videoUrl ? (
                <video src={draft.videoUrl} controls style={{ width: "100%", borderRadius: 12, marginBottom: 14, border: "1px solid var(--border)" }} />
              ) : draft.imageUrl ? (
                <img src={draft.imageUrl} alt="" style={{ width: "100%", borderRadius: 12, marginBottom: 14, border: "1px solid var(--border)" }} />
              ) : null}
              <div className="tag" style={{ marginBottom: 6 }}>Caption</div>
              <textarea className="textarea" rows={7} value={captionEdit} onChange={(e) => setCaptionEdit(e.target.value)} style={{ resize: "vertical" }} />
              <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                <button className="btn btn-primary" onClick={saveCaption} disabled={savingCaption}>{savingCaption ? "Saving…" : "Save caption"}</button>
                {draft.imageUrl && <a className="btn btn-ghost" href={draft.imageUrl} download target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>Download image</a>}
                <button className="btn btn-ghost" onClick={() => { navigator.clipboard?.writeText(captionEdit); setMsg("✅ Caption copied."); }}>Copy caption</button>
              </div>

              <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
                <div className="tag" style={{ marginBottom: 8 }}>Publish to</div>
                {accounts.length === 0 ? (
                  <p style={{ color: "var(--text-dim)", fontSize: 13 }}>Connect a channel above to publish.</p>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                    {accounts.map((a) => {
                      const on = selected.includes(a.id);
                      return (
                        <button key={a.id} onClick={() => toggle(a.id)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: "pointer", border: `1.5px solid ${on ? "var(--accent)" : "var(--border)"}`, background: on ? "var(--accent)" : "transparent", color: "var(--text)" }}>
                          {ICONS[a.platform] || "📣"} {a.displayName || a.platform}
                        </button>
                      );
                    })}
                  </div>
                )}
                {accounts.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div className="tag" style={{ marginBottom: 6 }}>Schedule (optional)</div>
                    <input className="input" type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} style={{ colorScheme: "dark" }} />
                    {scheduleAt && <button className="btn btn-ghost" style={{ marginLeft: 8, padding: "6px 12px" }} onClick={() => setScheduleAt("")}>Clear</button>}
                  </div>
                )}
                <button className="btn btn-accent" onClick={publish} disabled={publishing || selected.length === 0}>{publishing ? (scheduleAt ? "Scheduling…" : "Publishing…") : scheduleAt ? `🗓️ Schedule for ${selected.length || "…"} channel${selected.length === 1 ? "" : "s"}` : `🚀 Publish to ${selected.length || "…"} channel${selected.length === 1 ? "" : "s"}`}</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* History */}
      <div className="panel" style={{ marginTop: 20 }}>
        <div style={{ fontWeight: 800, marginBottom: 14 }}>🗂️ Recent posts</div>
        {posts.length === 0 && <p style={{ color: "var(--text-dim)", fontSize: 13 }}>No posts yet.</p>}
        <div style={{ display: "grid", gap: 14 }}>
          {posts.map((post) => (
            <div key={post.id} style={{ display: "flex", gap: 14, alignItems: "flex-start", padding: 12, borderRadius: 12, border: "1px solid var(--border)", background: "var(--panel-2)" }}>
              {post.videoUrl ? (
                <video src={post.videoUrl} muted style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 9, flexShrink: 0 }} />
              ) : post.imageUrl ? (
                <img src={post.imageUrl} alt="" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 9, flexShrink: 0 }} />
              ) : null}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="tag" style={{ marginBottom: 4 }}>{post.status}{post.status === "scheduled" && post.scheduledAt ? ` · ${new Date(post.scheduledAt).toLocaleString()}` : ` · ${new Date(post.createdAt).toLocaleString()}`}</div>
                <div style={{ fontSize: 13, whiteSpace: "pre-wrap", maxHeight: 80, overflow: "hidden" }}>{post.caption}</div>
                {post.targets && post.targets.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                    {post.targets.map((t, i) =>
                      t.remoteUrl ? (
                        <a key={i} href={t.remoteUrl} target="_blank" rel="noreferrer" title={t.error || ""} style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6, textDecoration: "none", background: "rgba(0,211,167,0.15)", color: "var(--accent-2)" }}>{ICONS[t.platform] || ""} {t.platform} ↗</a>
                      ) : (
                        <span key={i} title={t.error || ""} style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: t.status === "published" ? "rgba(0,211,167,0.15)" : "rgba(255,107,107,0.15)", color: t.status === "published" ? "var(--accent-2)" : "var(--danger)" }}>{ICONS[t.platform] || ""} {t.platform}: {t.status}</span>
                      ),
                    )}
                  </div>
                )}
              </div>
              <button className="btn btn-ghost" style={{ color: "var(--danger)", padding: "6px 12px" }} onClick={() => remove(post.id)} disabled={deletingId === post.id}>{deletingId === post.id ? "…" : "Delete"}</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
