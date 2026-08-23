"use client";

import { AlertTriangle, Trash2, X } from "lucide-react";

export default function DeleteDialog({
  title,
  description,
  busy,
  onClose,
  onConfirm,
}: {
  title: string;
  description: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-title" aria-describedby="delete-description">
        <button className="dialog-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        <span className="delete-warning"><AlertTriangle size={22} /></span>
        <h2 id="delete-title">{title}</h2>
        <p id="delete-description">{description}</p>
        <div className="delete-dialog-actions">
          <button className="outline-button" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="danger-button" onClick={onConfirm} disabled={busy}><Trash2 size={16} />{busy ? "Deleting…" : "Delete permanently"}</button>
        </div>
      </section>
    </div>
  );
}
