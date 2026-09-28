"use client";

import Link from "next/link";
import { CSSProperties, FormEvent, useEffect, useState } from "react";
import { ArrowLeft, Check, KeyRound, LockKeyhole, Save, Settings, Sparkles } from "lucide-react";
import type { SkillLevel } from "@/lib/coach";

const skillOptions: Array<{ value: SkillLevel; description: string }> = [
  { value: "Beginner", description: "Plain language and one clear idea." },
  { value: "Intermediate", description: "Plans, patterns, and practical tactics." },
  { value: "Pro", description: "Casual, concise, lightly strategic." },
];

// Rendered as a plain text input so password managers do not treat the settings
// form as a login form; the characters are still masked visually.
const maskedInputStyle = { WebkitTextSecurity: "disc" } as CSSProperties;

type SettingsResponse = {
  enabled: boolean;
  apiBaseUrl: string;
  modelName: string;
  skillLevel: SkillLevel;
  hasApiKey: boolean;
};

export default function SettingsPanel() {
  const [enabled, setEnabled] = useState(false);
  const [legalMovesEnabled, setLegalMovesEnabled] = useState(true);
  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [modelName, setModelName] = useState("");
  const [skillLevel, setSkillLevel] = useState<SkillLevel>("Intermediate");
  const [hasApiKey, setHasApiKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setLegalMovesEnabled(window.localStorage.getItem("chessTutor.legalMoveHighlights") !== "false");
    fetch("/api/settings", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Settings could not be loaded.");
        return response.json() as Promise<SettingsResponse>;
      })
      .then((data) => {
        setEnabled(data.enabled);
        setApiBaseUrl(data.apiBaseUrl);
        setModelName(data.modelName);
        setSkillLevel(data.skillLevel);
        setHasApiKey(data.hasApiKey);
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Settings could not be loaded."))
      .finally(() => setLoading(false));
  }, []);

  function toggleLegalMoves() {
    setLegalMovesEnabled((current) => {
      const next = !current;
      window.localStorage.setItem("chessTutor.legalMoveHighlights", String(next));
      return next;
    });
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, apiBaseUrl, apiKey, modelName, skillLevel }),
      });
      const data = (await response.json()) as SettingsResponse & { error?: string };
      if (!response.ok) throw new Error(data.error || "Settings could not be saved.");
      window.localStorage.setItem("chessTutor.legalMoveHighlights", String(legalMovesEnabled));
      setApiKey("");
      setHasApiKey(data.hasApiKey);
      setMessage("Settings saved securely");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Settings could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/" className="brand">
          <span className="brand-mark">♞</span>
          <span><span className="brand-name">ChessTutor</span><span className="brand-subtitle">Practice with purpose</span></span>
        </Link>
        <nav className="nav" aria-label="Primary navigation">
          <div className="nav-label">Workspace</div>
          <Link className="nav-link" href="/"><span>♟</span>Practice room</Link>
          <Link className="nav-link" href="/"><span>◷</span>Game history</Link>
          <Link className="nav-link active" href="/settings"><Settings />Settings</Link>
        </nav>
        <div className="sidebar-spacer" />
        <div className="engine-card"><div className="engine-card-top"><span>Privacy by design</span><LockKeyhole size={14} /></div><div className="engine-status"><span className="status-dot" />Keys never reach the browser</div></div>
        <div className="sidebar-foot"><div className="avatar">AM</div><div className="user-copy"><strong>Alex Morgan</strong><span>Local player</span></div></div>
      </aside>

      <main className="main-area">
        <header className="topbar"><div className="breadcrumb"><Link href="/">Workspace</Link><span>›</span><strong>Settings</strong></div><div className="topbar-right"><span className="kicker"><span className="kicker-dot" /> Coach configuration</span><Link className="icon-btn" href="/" aria-label="Back to practice"><ArrowLeft /></Link></div></header>
        <div className="content-wrap settings-layout">
          <div className="page-intro" style={{ marginTop: 0 }}><div><div className="eyebrow">Workspace / Private configuration</div><h1 className="page-title">Make the coach yours.</h1><p className="page-description">Connect an OpenAI-compatible model for thoughtful, move-by-move feedback while keeping your provider key off the client.</p></div></div>
          <form className="settings-card" onSubmit={onSubmit} autoComplete="off">
            <div className="settings-top"><div className="settings-title-row"><div><h1>Preferences</h1><p>Tune board assistance and configure private, move-by-move coaching.</p></div>{enabled && <span className="save-status"><span className="status-dot" />Coach active</span>}</div></div>
            <section className="settings-section">
              <div className="section-heading"><span className="section-number">01</span><div><h2>Board assistance</h2><p>Control the visual cues shown while you calculate.</p></div></div>
              <div className="toggle-row"><div className="toggle-copy"><strong>Show legal moves</strong><span>Display destination dots and capture rings when you select or drag a piece.</span></div><button type="button" aria-label="Toggle legal move highlights" aria-pressed={legalMovesEnabled} className={`toggle ${legalMovesEnabled ? "on" : ""}`} onClick={toggleLegalMoves} /></div>
            </section>
            <section className="settings-section">
              <div className="section-heading"><span className="section-number">02</span><div><h2>Coach access</h2><p>Choose whether ChessTutor should ask your configured model after every move.</p></div></div>
              <div className="toggle-row"><div className="toggle-copy"><strong>Enable AI Coach</strong><span>When enabled, commentary is saved with each move in your game.</span></div><button type="button" aria-label="Toggle AI Coach" aria-pressed={enabled} className={`toggle ${enabled ? "on" : ""}`} onClick={() => setEnabled((current) => !current)} /></div>
            </section>
            {enabled ? <section className="settings-section">
              <div className="section-heading"><span className="section-number">03</span><div><h2>Provider connection</h2><p>Use a provider endpoint that accepts the Chat Completions format.</p></div></div>
              <div className="form-grid">
                <div className="form-field full"><label htmlFor="apiBaseUrl">API base URL</label><input id="apiBaseUrl" name="chesstutor-api-base-url" autoComplete="off" value={apiBaseUrl} onChange={(event) => setApiBaseUrl(event.target.value)} placeholder="https://api.openai.com/v1" disabled={loading} /><p className="form-help">We append /chat/completions automatically when needed.</p></div>
                <div className="form-field"><label htmlFor="modelName">Model name</label><input id="modelName" name="chesstutor-model-name" autoComplete="off" value={modelName} onChange={(event) => setModelName(event.target.value)} placeholder="gpt-4o-mini" disabled={loading} /></div>
                <div className="form-field"><label htmlFor="apiKey">API key {hasApiKey && "· saved"}</label><input id="apiKey" name="chesstutor-api-key" type="text" style={maskedInputStyle} value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={hasApiKey ? "Leave blank to keep current key" : "sk-…"} autoComplete="off" disabled={loading} /><p className="form-help"><KeyRound size={11} style={{ verticalAlign: "-2px", marginRight: 4 }} />Encrypted at rest with AES-256-GCM.</p></div>
              </div>
            </section> : <section className="settings-section"><div className="section-heading"><span className="section-number">03</span><div><h2>Provider connection</h2><p>Turn on AI Coach above to securely connect a model and reveal its connection fields.</p></div></div></section>}
            <section className="settings-section">
              <div className="section-heading"><span className="section-number">04</span><div><h2>Teaching style</h2><p>The fixed ChessTutor system prompt adapts its language, not its rules.</p></div></div>
              <div className="skill-options">{skillOptions.map((option) => <button type="button" key={option.value} className={`skill-option ${skillLevel === option.value ? "selected" : ""}`} onClick={() => setSkillLevel(option.value)}><strong>{option.value}{skillLevel === option.value && <Check size={13} style={{ float: "right" }} />}</strong><span>{option.description}</span></button>)}</div>
            </section>
            <div className="settings-actions">{error && <span className="form-error">{error}</span>}{message && !error && <span className="form-success"><Sparkles size={12} style={{ verticalAlign: "-2px", marginRight: 4 }} />{message}</span>}<Link className="button button-quiet" href="/">Cancel</Link><button className="button button-primary" type="submit" disabled={loading || saving}>{saving ? "Saving…" : <><Save />Save settings</>}</button></div>
          </form>
        </div>
      </main>
    </div>
  );
}
