/**
 * Dispute detail loading skeleton (new alabaster theme). Shimmer bars only
 * — no invented numbers or content while the dispute loads.
 */
export default function Loading() {
  return (
    <main className="detail-wrap">
      <div className="loading-shimmer" style={{ height: 56, borderRadius: 999 }} />
      <div className="loading-shimmer" style={{ height: 180, borderRadius: 16 }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 20 }}>
        <div className="loading-shimmer" style={{ height: 220, borderRadius: 16 }} />
        <div className="loading-shimmer" style={{ height: 220, borderRadius: 16 }} />
      </div>
      <div className="loading-shimmer" style={{ height: 140, borderRadius: 16 }} />
    </main>
  );
}
