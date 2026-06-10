"use client";

import { useEffect, useState, type FormEvent } from "react";

type Target = { platform: string; status: string; remoteUrl: string | null; error: string | null };
type Post = { id: string; prompt: string; caption: string; status: string; createdAt: string; scheduledAt?: string | null; imageUrl: string | null; videoUrl?: string | null; targets?: Target[] };
type Account = { id: string; platform: string; displayName: string | null; externalId: string | null; tokenExpiresAt: string | null; createdAt: string };

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

function Studio({ onLogout }: { onLogout: () => void }) {
  const [prompt, setPrompt] = useState("");
  const [tone, setTone] = useState("");
  const [generating, setGenerating] = useState(false);
  const [msg, setMsg] = useState("");
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

  const loadPosts = () => fetch("/api/social/posts").then((r) => (r.ok ? r.json() : [])).then((d) => setPosts(Array.isArray(d) ? d : [])).catch(() => {});
  const loadAccounts = () => fetch("/api/social/accounts").then((r) => (r.ok ? r.json() : [])).then((d) => setAccounts(Array.isArray(d) ? d : [])).catch(() => {});

  useEffect(() => {
    loadPosts();
    loadAccounts();
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
          <a className="btn btn-ghost" href="/settings" style={{ textDecoration: "none" }}>⚙️ Settings</a>
          <button className="btn btn-ghost" onClick={logout}>Sign out</button>
        </div>
      </header>

      {accounts.length === 0 && (
        <div className="panel" style={{ marginBottom: 20, padding: "12px 16px" }}>
          No channels connected yet — head to <a href="/settings" style={{ color: "var(--accent-2)", fontWeight: 700 }}>⚙️ Settings → Connections</a> to connect your accounts.
        </div>
      )}

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
