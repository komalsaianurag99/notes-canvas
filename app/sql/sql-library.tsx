"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Download,
  Eye,
  FileImage,
  ImagePlus,
  MoreVertical,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import DeleteDialog from "../delete-dialog";
import { SHOW_EDIT_CONTROLS } from "../site-config";

type Concept = { id: number; title: string; description: string };
type Topic = {
  id: number;
  conceptId: number;
  parentId: number | null;
  title: string;
  description: string;
  sortOrder: number;
};
type Asset = { id: number; topicId: number; filename: string; byteSize: number };
type LibraryData = { concepts: Concept[]; topics: Topic[]; assets: Asset[] };
type CreateSettings = { conceptId: number; parentId: number | null; sectionNumber?: number };
type DeleteTarget = { kind: "concept" | "topic" | "asset"; id: number; title: string; description: string };
const MAX_SOURCE_IMAGE_BYTES = 10 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function validateImage(file: File) {
  if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
    throw new Error("Choose a PNG, JPG, or WEBP image.");
  }
  if (file.size > MAX_SOURCE_IMAGE_BYTES) {
    throw new Error("Choose an image smaller than 10 MB.");
  }
}

async function readUploadResult(response: Response) {
  const raw = await response.text();
  let payload: { error?: string } = {};
  if (raw) {
    try {
      payload = JSON.parse(raw) as { error?: string };
    } catch {
      payload = {};
    }
  }
  if (!response.ok) {
    if (response.status === 413 || /payload too large/i.test(raw)) {
      throw new Error("This image is too large for the server. Choose an image smaller than 10 MB.");
    }
    throw new Error(payload.error || "Unable to upload the image. Please try again.");
  }
  return payload;
}

async function getLibrary() {
  const response = await fetch("/api/concepts", { cache: "no-store" });
  const payload = (await response.json()) as LibraryData & { error?: string };
  if (!response.ok) throw new Error(payload.error || "Unable to load this library.");
  return payload;
}

export default function SqlLibrary({ conceptId }: { conceptId?: number }) {
  const [data, setData] = useState<LibraryData>({ concepts: [], topics: [], assets: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set());
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());
  const [createSettings, setCreateSettings] = useState<CreateSettings | null>(null);
  const [viewer, setViewer] = useState<Asset | null>(null);
  const [uploading, setUploading] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function reload() {
    try {
      setData(await getLibrary());
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load this library.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    void getLibrary()
      .then((payload) => {
        if (active) setData(payload);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Unable to load this library.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setViewer(null);
        setCreateSettings(null);
        setDeleteTarget(null);
      }
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  const concept = conceptId
    ? data.concepts.find((item) => item.id === conceptId)
    : data.concepts.find((item) => item.title === "SQL");

  const allSections = useMemo(
    () => data.topics.filter((topic) => topic.conceptId === concept?.id && topic.parentId === null),
    [concept?.id, data.topics],
  );
  const sections = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return allSections;
    return allSections.filter((section) => {
      const items = data.topics.filter((topic) => topic.parentId === section.id);
      return `${section.title} ${section.description}`.toLowerCase().includes(normalized) ||
        items.some((item) => `${item.title} ${item.description}`.toLowerCase().includes(normalized));
    });
  }, [allSections, data.topics, query]);

  function toggle(setter: React.Dispatch<React.SetStateAction<Set<number>>>, id: number) {
    setter((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function uploadImage(topicId: number, file?: File) {
    if (!file) return;
    setUploading(topicId);
    setError("");
    try {
      validateImage(file);
      const form = new FormData();
      form.append("topicId", String(topicId));
      form.append("file", file);
      const response = await fetch("/api/assets", { method: "POST", body: form });
      await readUploadResult(response);
      setExpandedItems((current) => new Set(current).add(topicId));
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to upload the image.");
    } finally {
      setUploading(null);
    }
  }

  async function deleteSelected() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const route = deleteTarget.kind === "concept" ? "concepts" : deleteTarget.kind === "topic" ? "topics" : "assets";
      const response = await fetch(`/api/${route}?id=${deleteTarget.id}`, { method: "DELETE" });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to delete this item.");
      if (deleteTarget.kind === "concept") {
        window.location.assign("/");
        return;
      }
      setViewer(null);
      setDeleteTarget(null);
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to delete this item.");
    } finally {
      setDeleting(false);
    }
  }

  const totalItems = data.topics.filter((topic) => topic.conceptId === concept?.id && topic.parentId !== null).length;

  if (!loading && !concept) {
    return (
      <main className="sql-page"><div className="concept-missing"><strong>Collection not found</strong><p>This workspace may have been removed.</p><Link href="/"><ArrowLeft size={16} /> Back to library</Link></div></main>
    );
  }

  return (
    <main className="sql-page">
      <div className="sql-titlebar">
        <div className="sql-titlebar-inner">
          <div className={concept?.description ? "sql-titlebar-copy" : "sql-titlebar-copy no-description"}>
            <div className="breadcrumbs"><Link href="/">Library</Link><ChevronRight size={13} /><strong>{concept?.title || "Loading"}</strong></div>
            <h1>{concept?.title || "Loading…"}</h1>
            {concept?.description && <p>{concept.description}</p>}
          </div>
          <div className="titlebar-stats" aria-label="Library summary">
            <span><strong>{String(allSections.length).padStart(2, "0")}</strong>Sections</span>
            <span><strong>{String(totalItems).padStart(2, "0")}</strong>Subsections</span>
          </div>
        </div>
      </div>

      <section className="concept-workspace" aria-labelledby="sections-heading">
        <div className="workspace-toolbar">
          <div>
            <h2 id="sections-heading">Learning sections</h2>
          </div>
          <div className="workspace-actions">
            <label className="section-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search this collection" aria-label="Search this collection" /></label>
            {SHOW_EDIT_CONTROLS && concept && concept.title !== "SQL" && (
              <button className="danger-outline-button" onClick={() => setDeleteTarget({ kind: "concept", id: concept.id, title: `Delete “${concept.title}”?`, description: "This permanently removes the collection, all of its learning content, and every uploaded image." })}><Trash2 size={16} /> Delete</button>
            )}
            {SHOW_EDIT_CONTROLS && concept && <button className="solid-button" onClick={() => setCreateSettings({ conceptId: concept.id, parentId: null })}><Plus size={17} /> Add section</button>}
          </div>
        </div>

        {error && <div className="inline-error" role="alert">{error}</div>}
        {loading ? (
          <div className="section-skeleton"><i /><i /><i /></div>
        ) : sections.length === 0 ? (
          <div className="no-results"><Search size={22} /><strong>No sections found</strong><span>{query ? "Try a different search." : SHOW_EDIT_CONTROLS ? "Add the first section to begin." : "There is no content in this collection yet."}</span></div>
        ) : (
          <div className="section-stack">
            {sections.map((section) => {
              const sectionIndex = allSections.findIndex((item) => item.id === section.id);
              const sectionNumber = sectionIndex + 1;
              const items = data.topics.filter((topic) => topic.parentId === section.id);
              const isOpen = expandedSections.has(section.id);
              return (
                <article className={`section-card ${isOpen ? "section-open" : ""}`} key={section.id}>
                  <div className="section-summary">
                    <button className="section-summary-main" onClick={() => toggle(setExpandedSections, section.id)} aria-expanded={isOpen}>
                      <span className="section-number">{String(sectionNumber).padStart(2, "0")}</span>
                      <span className="section-copy"><strong>{section.title}</strong>{section.description && <small>{section.description}</small>}</span>
                      <span className="section-meta">{items.length} item{items.length === 1 ? "" : "s"}</span>
                      <span className="icon-button" aria-hidden="true"><ChevronDown size={18} /></span>
                    </button>
                    {SHOW_EDIT_CONTROLS && <button className="row-delete" onClick={() => setDeleteTarget({ kind: "topic", id: section.id, title: `Delete “${section.title}”?`, description: "This permanently removes the section, every subsection inside it, and their uploaded images." })} aria-label={`Delete ${section.title}`} title="Delete section"><Trash2 size={16} /></button>}
                  </div>

                  <div className="section-content" hidden={!isOpen}>
                    <div className="section-content-bar">
                      <span>{items.length ? `${items.length} learning card${items.length === 1 ? "" : "s"}` : "No learning cards yet"}</span>
                      {SHOW_EDIT_CONTROLS && <button onClick={() => setCreateSettings({ conceptId: section.conceptId, parentId: section.id, sectionNumber })}><Plus size={15} /> Add subsection</button>}
                    </div>
                    <div className="subsection-stack">
                      {items.map((item, itemIndex) => {
                        const itemAssets = data.assets.filter((asset) => asset.topicId === item.id);
                        const latestAsset = itemAssets[itemAssets.length - 1];
                        const itemOpen = expandedItems.has(item.id);
                          return (
                            <article className={`subsection-card ${itemOpen ? "subsection-open" : ""}`} key={item.id}>
                            <div className="subsection-summary">
                              <button className="subsection-summary-main" onClick={() => toggle(setExpandedItems, item.id)} aria-expanded={itemOpen}>
                                <span className="subsection-number">{sectionNumber}.{itemIndex + 1}</span>
                                <span className="subsection-copy"><strong>{item.title}</strong>{item.description && <small>{item.description}</small>}</span>
                                {latestAsset && <span className="asset-status ready" aria-label="Image attached" title="Image attached"><FileImage size={15} /></span>}
                                <span className="icon-button" aria-hidden="true"><ChevronDown size={17} /></span>
                              </button>
                              {SHOW_EDIT_CONTROLS && <button className="row-delete" onClick={() => setDeleteTarget({ kind: "topic", id: item.id, title: `Delete “${item.title}”?`, description: "This permanently removes the subsection and all images attached to it." })} aria-label={`Delete ${item.title}`} title="Delete subsection"><Trash2 size={16} /></button>}
                            </div>
                            <div className="subsection-content" hidden={!itemOpen}>
                              {latestAsset ? (
                                <>
                                  {SHOW_EDIT_CONTROLS && <details className="asset-menu">
                                    <summary aria-label="Image options" title="Image options"><MoreVertical size={19} /></summary>
                                    <div className="asset-menu-popover">
                                      <UploadControl topicId={item.id} busy={uploading === item.id} onUpload={uploadImage} compact />
                                      <button className="asset-menu-danger" onClick={() => setDeleteTarget({ kind: "asset", id: latestAsset.id, title: "Delete this image?", description: "This permanently removes the uploaded image from this subsection." })}><Trash2 size={15} /> Delete image</button>
                                    </div>
                                  </details>}
                                  <div className="visual-panel">
                                    <button className="visual-thumb" onClick={() => setViewer(latestAsset)} aria-label={`View ${latestAsset.filename}`}>
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img src={`/api/images/${latestAsset.id}`} alt={latestAsset.filename} />
                                      <span><Eye size={18} /> Preview</span>
                                    </button>
                                    <div className="visual-details">
                                      <div className="visual-buttons">
                                        <button className="solid-button" onClick={() => setViewer(latestAsset)}><Eye size={16} /> View image</button>
                                        <a className="outline-button" href={`/api/images/${latestAsset.id}?download=1`} download={latestAsset.filename}><Download size={16} /> Download</a>
                                      </div>
                                    </div>
                                  </div>
                                </>
                              ) : SHOW_EDIT_CONTROLS ? (
                                <UploadControl topicId={item.id} busy={uploading === item.id} onUpload={uploadImage} />
                              ) : null}
                            </div>
                          </article>
                        );
                      })}
                      {SHOW_EDIT_CONTROLS && items.length === 0 && (
                        <button className="empty-subsection" onClick={() => setCreateSettings({ conceptId: section.conceptId, parentId: section.id, sectionNumber })}>
                          <span><Plus size={20} /></span><strong>Add the first subsection</strong><small>Create a numbered learning card inside this section.</small>
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {SHOW_EDIT_CONTROLS && createSettings && concept && (
        <CreateTopicModal
          conceptTitle={concept.title}
          settings={createSettings}
          onClose={() => setCreateSettings(null)}
          onCreated={async (topicId) => {
            if (createSettings.parentId) {
              setExpandedSections((current) => new Set(current).add(createSettings.parentId!));
              setExpandedItems((current) => new Set(current).add(topicId));
            } else {
              setExpandedSections((current) => new Set(current).add(topicId));
            }
            setCreateSettings(null);
            await reload();
          }}
        />
      )}
      {viewer && <ImageViewer asset={viewer} onClose={() => setViewer(null)} />}
      {SHOW_EDIT_CONTROLS && deleteTarget && (
        <DeleteDialog
          title={deleteTarget.title}
          description={deleteTarget.description}
          busy={deleting}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => void deleteSelected()}
        />
      )}
    </main>
  );
}

function UploadControl({ topicId, busy, onUpload, compact = false }: { topicId: number; busy: boolean; onUpload: (topicId: number, file?: File) => void; compact?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const progressLabel = "Uploading…";
  return (
    <>
      <input ref={input} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { void onUpload(topicId, event.target.files?.[0]); event.target.value = ""; }} />
      {compact ? (
        <button className="text-upload" disabled={busy} onClick={() => input.current?.click()}><RefreshCw size={15} />{busy ? progressLabel : "Replace"}</button>
      ) : (
        <button className="upload-zone" disabled={busy} onClick={() => input.current?.click()}>
          <span className="upload-icon"><UploadCloud size={23} /></span>
          <span><strong>{busy ? progressLabel : "Upload a learning image"}</strong><small>PNG, JPG or WEBP · Up to 10 MB · Original quality</small></span>
          <i><ImagePlus size={15} /> Choose image</i>
        </button>
      )}
    </>
  );
}

function CreateTopicModal({ conceptTitle, settings, onClose, onCreated }: { conceptTitle: string; settings: CreateSettings; onClose: () => void; onCreated: (topicId: number) => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const isSubsection = settings.parentId !== null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch("/api/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conceptId: settings.conceptId, parentId: settings.parentId, title, description }),
      });
      const result = (await response.json()) as { topic?: Topic; error?: string };
      if (!response.ok || !result.topic) throw new Error(result.error || "Unable to create this item.");
      onCreated(result.topic.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create this item.");
      setSaving(false);
    }
  }

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="content-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <button className="dialog-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        <span className="overline">{conceptTitle}</span>
        <h2 id="dialog-title">{isSubsection ? `Add subsection ${settings.sectionNumber}.x` : "Add a section"}</h2>
        <p>Numbering is added automatically.</p>
        <form onSubmit={submit}>
          <label>{isSubsection ? "Subsection name" : "Section name"}<input autoFocus required value={title} onChange={(event) => setTitle(event.target.value)} placeholder={isSubsection ? "e.g. Primary keys" : "e.g. Database keys"} /></label>
          <label>Description <span>Optional</span><textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="A short description" /></label>
          {error && <div className="form-message">{error}</div>}
          <div className="dialog-actions"><button type="button" className="outline-button" onClick={onClose}>Cancel</button><button className="solid-button" disabled={saving}><Plus size={16} />{saving ? "Creating…" : isSubsection ? "Add subsection" : "Add section"}</button></div>
        </form>
      </section>
    </div>
  );
}

function ImageViewer({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  return (
    <div className="image-viewer" role="dialog" aria-modal="true" aria-label={`Viewing ${asset.filename}`}>
      <header><div><span>Learning image</span><strong>{asset.filename}</strong></div><div><a href={`/api/images/${asset.id}?download=1`} download={asset.filename}><Download size={16} /> Download</a><button onClick={onClose} aria-label="Close viewer"><X size={19} /></button></div></header>
      <div className="image-stage" onClick={onClose}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/images/${asset.id}`} alt={asset.filename} onClick={(event) => event.stopPropagation()} />
      </div>
    </div>
  );
}
