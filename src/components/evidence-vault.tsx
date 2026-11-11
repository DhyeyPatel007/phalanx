// Merchant Bill & Evidence Attachment Vault (Gemini directive §3.5,
// right pane). Drag-and-drop uploader with the 7 EvidenceTypes and the
// directive's point values, 300ms HashScrambler locking onto the real
// SHA-256, STRONG/WEAK badge, and Remove via DELETE. Attaching updates
// the score, practical reasons, named gaps and PDF dossier because the
// parent reloads the dispute detail after a successful upload.
// Point values come from src/lib/evidence-scorer.ts (the server is the
// authority — these labels only display them).
"use client";

import { useRef, useState, type RefObject } from "react";
import type { AttachedEvidence, EvidenceType } from "@/lib/types";
import { CopyChip, HashScrambler } from "./ui/micro-interactions";
import styles from "./detail.module.css";

export const EVIDENCE_TYPE_POINTS: Record<
  EvidenceType,
  { strong: number; weak: number; label: string }
> = {
  INVOICE: { strong: 15, weak: 6, label: "INVOICE (Itemized bill / Order record)" },
  TRACKING_RECEIPT: { strong: 20, weak: 8, label: "TRACKING_RECEIPT (Courier drop-off receipt)" },
  DELIVERY_PHOTO: { strong: 15, weak: 6, label: "DELIVERY_PHOTO (Visual condition / drop-off proof)" },
  CARRIER_POD: { strong: 25, weak: 10, label: "CARRIER_POD (Signed Proof-of-Delivery)" },
  MERCHANT_LOG: { strong: 25, weak: 10, label: "MERCHANT_LOG (System / Fulfillment access log)" },
  EMAIL_CONFIRMATION: { strong: 10, weak: 4, label: "EMAIL_CONFIRMATION (Buyer communications)" },
  OTHER: { strong: 5, weak: 2, label: "OTHER (Supporting exhibit)" },
};

/** Cross-anchor check badge text for one exhibit. Attachments stored
 *  before cross-verification existed have no crossVerify result and
 *  render as UNVERIFIED (Self-attested). */
export function crossAnchorLabel(att: AttachedEvidence): string {
  const cv = att.crossVerify;
  if (!cv) return "Cross-Anchor Check: UNVERIFIED (Self-attested)";
  if (cv.status === "VERIFIED") {
    return `Cross-Anchor Check: VERIFIED (${cv.anchorsMatched}/${cv.anchorsTotal} anchors match PayPal record)`;
  }
  if (cv.status === "CONTRADICTION") {
    return "Cross-Anchor Check: CONTRADICTION (0 pts awarded)";
  }
  return "Cross-Anchor Check: UNVERIFIED (Self-attested)";
}

export default function EvidenceVault({
  disputeId,
  attached,
  evidenceType,
  onEvidenceTypeChange,
  highlightedType,
  onAttached,
  onRemove,
  busy,
  vaultRef,
}: {
  disputeId: string;
  attached: AttachedEvidence[];
  evidenceType: EvidenceType;
  onEvidenceTypeChange: (t: EvidenceType) => void;
  /** Gap-recommended type being hovered in the left pane (or null). */
  highlightedType: EvidenceType | null;
  /** Called after a successful upload so the parent reloads the detail. */
  onAttached: () => void;
  onRemove: (evidenceId: string) => void;
  busy: boolean;
  vaultRef: RefObject<HTMLDivElement | null>;
}) {
  const [referenceId, setReferenceId] = useState("");
  const [documentDate, setDocumentDate] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [lastAttach, setLastAttach] = useState<{
    sha256: string;
    quality: "STRONG" | "WEAK" | "INVALID";
    scoreDelta: number;
    fileName: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleAttachSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;
    setUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("evidenceType", evidenceType);
      if (referenceId) formData.append("referenceId", referenceId);
      if (documentDate) formData.append("documentDate", documentDate);
      if (notes) formData.append("notes", notes);

      const res = await fetch(`/api/disputes/${disputeId}/evidence`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setUploadError(data.error || "Failed to attach evidence");
        return;
      }
      if (data.item?.sha256) {
        setLastAttach({
          sha256: data.item.sha256,
          quality: data.item.quality,
          scoreDelta: data.item.scoreDelta,
          fileName: data.item.fileName,
        });
      }
      setSelectedFile(null);
      setReferenceId("");
      setDocumentDate("");
      setNotes("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      onAttached();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      ref={vaultRef}
      id="evidence-vault"
      className={`card-white vault-card ${styles.reveal}${highlightedType ? " vault-highlight" : ""}`}
    >
      <div className="vault-head">
        <h3 className="vault-title">
          Attached Bills &amp; Evidence Exhibits
        </h3>
        <span className="chip">
          {attached.length} / 10 files
        </span>
      </div>

      {highlightedType && (
        <div className="evidence-hint" role="status">
          Gap needs <b>{highlightedType}</b> — attach that category to
          recover the points.
        </div>
      )}

      {lastAttach && (
        <HashScrambler
          sha256={lastAttach.sha256}
          quality={lastAttach.quality}
          delta={lastAttach.scoreDelta}
          fileName={lastAttach.fileName}
        />
      )}

      <form onSubmit={handleAttachSubmit} className="vault-form">
        <div className="form-group">
          <label className="form-label" htmlFor="vault-evidence-type">
            Evidence Type
          </label>
          <select
            id="vault-evidence-type"
            className="form-select"
            value={evidenceType}
            onChange={(e) =>
              onEvidenceTypeChange(e.target.value as EvidenceType)
            }
          >
            {(Object.keys(EVIDENCE_TYPE_POINTS) as EvidenceType[]).map(
              (t) => (
                <option key={t} value={t}>
                  {EVIDENCE_TYPE_POINTS[t].label}: +
                  {EVIDENCE_TYPE_POINTS[t].strong} pts (Strong) / +
                  {EVIDENCE_TYPE_POINTS[t].weak} pts (Weak)
                </option>
              ),
            )}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="vault-reference-id">
            Reference / Bill ID
          </label>
          <input
            id="vault-reference-id"
            type="text"
            className="form-input"
            placeholder="e.g. INV-88412 or 1Z999AA10123456784"
            value={referenceId}
            onChange={(e) => setReferenceId(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="vault-document-date">
            Document Date (YYYY-MM-DD)
          </label>
          <input
            id="vault-document-date"
            type="date"
            className="form-input"
            value={documentDate}
            onChange={(e) => setDocumentDate(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="vault-notes">
            Notes (optional)
          </label>
          <input
            id="vault-notes"
            type="text"
            className="form-input"
            placeholder="What does this exhibit prove?"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label className="form-label">
            File Document (PDF, PNG, JPG, TXT, JSON, CSV — Max 5 MB)
          </label>
          <div
            className={`dropzone ${styles.dropzone}${isDragOver ? " dragging" : ""}${highlightedType ? " highlight-dropzone-ring" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) setSelectedFile(f);
            }}
          >
            {isDragOver && (
              <svg
                className="marching-ants"
                aria-hidden="true"
                preserveAspectRatio="none"
                viewBox="0 0 100 100"
              >
                <rect x="1.5" y="1.5" width="97" height="97" rx="10" />
              </svg>
            )}
            <span className="dropzone-icon">⇪</span>
            <p className="dropzone-text">
              Drop a bill or courier receipt here, or choose a file below.
              The real SHA-256 is shown after upload.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              className="form-input"
              accept=".pdf,.png,.jpg,.jpeg,.txt,.json,.csv"
              required
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
            />
            {selectedFile && (
              <p className="dropzone-selected font-mono">
                Selected: {selectedFile.name} (
                {(selectedFile.size / 1024).toFixed(1)} KB)
              </p>
            )}
          </div>
        </div>

        {uploadError && (
          <div className="callout error">{uploadError}</div>
        )}

        <div className="vault-submit-row">
          <button
            type="submit"
            className={`primary ${styles.magnetic}`}
            disabled={uploading || !selectedFile}
          >
            {uploading ? "Verifying & Rescoring…" : "+ Attach Bill / Upload Exhibit"}
          </button>
        </div>
      </form>

      {attached.length === 0 ? (
        <div className="vault-empty">
          <p>No merchant bills or courier receipts attached yet.</p>
        </div>
      ) : (
        <div className="vault-list">
          {attached.map((att) => (
            <div key={att.id} className={`vault-item ${styles.vaultItem}`}>
              <div className="vault-item-main">
                <div className="vault-item-head">
                  <span className="vault-item-name">{att.fileName}</span>
                  <span className="chip font-mono vault-item-type">
                    {att.evidenceType}
                  </span>
                  <span
                    className={`badge ${att.quality === "STRONG" ? "strong" : "weak"}`}
                  >
                    {att.quality} (+{att.scoreDelta} pts)
                  </span>
                </div>
                <div className="font-mono vault-item-hash">
                  <span>
                    SHA-256: {att.sha256.slice(0, 12)}… ·{" "}
                    {(att.sizeBytes / 1024).toFixed(1)} KB
                    {att.referenceId ? ` · Ref: ${att.referenceId}` : ""}
                  </span>
                  <CopyChip text={att.sha256} label="Copy hash" />
                </div>
                <div className="vault-item-badges">
                  <div className="vault-badge">
                    <span className="chip font-mono">
                      Post-Upload Lock: SHA-256 {att.sha256.slice(0, 12)}…
                    </span>
                    <span className="vault-badge-sub">
                      Proves file bytes were not altered after upload to
                      PHALANX
                    </span>
                  </div>
                  <div className="vault-badge">
                    <span
                      className={`badge ${att.crossVerify?.status === "VERIFIED" ? "strong" : "weak"}`}
                    >
                      {crossAnchorLabel(att)}
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="btn vault-remove"
                onClick={() => onRemove(att.id)}
                disabled={busy}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
