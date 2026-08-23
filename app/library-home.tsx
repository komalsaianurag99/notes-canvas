"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { ArrowUpRight, Database, Plus, Trash2, X } from "lucide-react";
import DeleteDialog from "./delete-dialog";
import { SHOW_EDIT_CONTROLS } from "./site-config";

type Concept = { id: number; title: string; description: string; accent: string };
type LibraryData = { concepts: Concept[] };

function collectionTitleSize(title: string) {
  const length = title.trim().length;

  if (length <= 4) return "62px";
  if (length <= 8) return "52px";
  if (length <= 13) return "44px";
  if (length <= 20) return "36px";
  return "30px";
}

async function fetchConcepts() {
  const response = await fetch("/api/concepts", { cache: "no-store" });
  const payload = (await response.json()) as LibraryData & { error?: string };
  if (!response.ok) throw new Error(payload.error || "Unable to load concepts.");
  return payload;
}

export default function LibraryHome() {
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Concept | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function reload() {
    try {
      const payload = await fetchConcepts();
      setConcepts(payload.concepts);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load concepts.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    void fetchConcepts()
      .then((payload) => {
        if (active) setConcepts(payload.concepts);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Unable to load concepts.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function deleteConcept() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/concepts?id=${deleteTarget.id}`, { method: "DELETE" });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to delete the concept.");
      setDeleteTarget(null);
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to delete the concept.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <main className="library-home">
      <section className="home-content">
        <div className="home-intro">
          <p className="overline">Knowledge workspace</p>
          <h1>Aardra&apos;s Library</h1>
        </div>

        <div className="concepts-label">
          <span>Collections</span>
          {SHOW_EDIT_CONTROLS && <button onClick={() => setShowCreate(true)}><Plus size={16} strokeWidth={2} /> New collection</button>}
        </div>

        {error && <div className="home-error" role="alert">{error}</div>}

        <div className="home-grid">
          {loading ? (
            <div className="concept-tile concept-tile-loading" aria-label="Loading concepts" />
          ) : (
            concepts.map((concept) => (
              <article className="concept-tile-wrap" key={concept.id}>
                <Link
                  className={`concept-tile concept-${concept.accent || "blue"}`}
                  href={concept.title === "SQL" ? "/sql" : `/concepts/${concept.id}`}
                  aria-label={`Open ${concept.title}`}
                >
                  <span className="concept-tile-grid" aria-hidden="true" />
                  <span className="concept-tile-top">
                    <span className="concept-glyph"><Database size={34} strokeWidth={1.5} /></span>
                    <span className="tile-open"><ArrowUpRight size={19} strokeWidth={1.8} /></span>
                  </span>
                  <span className="concept-tile-title" style={{ fontSize: collectionTitleSize(concept.title) }}>
                    {concept.title}
                  </span>
                  {concept.description && <span className="concept-tile-description">{concept.description}</span>}
                </Link>
                {SHOW_EDIT_CONTROLS && concept.title !== "SQL" && (
                  <button className="tile-delete" onClick={() => setDeleteTarget(concept)} aria-label={`Delete ${concept.title}`} title={`Delete ${concept.title}`}>
                    <Trash2 size={17} />
                  </button>
                )}
              </article>
            ))
          )}

        </div>
      </section>
      {SHOW_EDIT_CONTROLS && showCreate && (
        <CreateConceptDialog
          onClose={() => setShowCreate(false)}
          onCreated={async () => {
            setShowCreate(false);
            await reload();
          }}
        />
      )}
      {SHOW_EDIT_CONTROLS && deleteTarget && (
        <DeleteDialog
          title={`Delete “${deleteTarget.title}”?`}
          description="This permanently removes the collection, every section and subsection, and all uploaded images inside it."
          busy={deleting}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => void deleteConcept()}
        />
      )}
    </main>
  );
}

function CreateConceptDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [accent, setAccent] = useState("blue");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/concepts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, accent }),
      });
      const payload = (await response.json()) as { concept?: Concept; error?: string };
      if (!response.ok || !payload.concept) throw new Error(payload.error || "Unable to create the concept.");
      onCreated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create the concept.");
      setSaving(false);
    }
  }

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="content-dialog" role="dialog" aria-modal="true" aria-labelledby="concept-dialog-title">
        <button className="dialog-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        <span className="overline">Aardra&apos;s Library</span>
        <h2 id="concept-dialog-title">Create a collection</h2>
        <p>Give the new workspace a clear name and short description.</p>
        <form onSubmit={submit}>
          <label>Collection name<input autoFocus required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Python" /></label>
          <label>Description <span>Optional</span><textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What will this collection cover?" /></label>
          <fieldset className="color-field"><legend>Card color</legend><div>{["blue", "violet", "teal", "rose", "orange"].map((color) => <button key={color} type="button" className={`${color} ${accent === color ? "selected" : ""}`} onClick={() => setAccent(color)} aria-label={`${color} card`} />)}</div></fieldset>
          {error && <div className="form-message">{error}</div>}
          <div className="dialog-actions"><button type="button" className="outline-button" onClick={onClose}>Cancel</button><button className="solid-button" disabled={saving}><Plus size={16} />{saving ? "Creating…" : "Create collection"}</button></div>
        </form>
      </section>
    </div>
  );
}
