/**
 * Dashboard loading skeleton (new alabaster theme). Shimmer bars only —
 * no invented numbers or content while the ledger loads.
 */
export default function Loading() {
  return (
    <main className="workbench-wrap">
      <div className="loading-shimmer" style={{ height: 56, borderRadius: 999 }} />
      <div className="loading-shimmer" style={{ height: 44, borderRadius: 16 }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
        <div className="loading-shimmer" style={{ height: 130, borderRadius: 16 }} />
        <div className="loading-shimmer" style={{ height: 130, borderRadius: 16 }} />
        <div className="loading-shimmer" style={{ height: 130, borderRadius: 16 }} />
        <div className="loading-shimmer" style={{ height: 130, borderRadius: 16 }} />
      </div>
      <div className="loading-shimmer" style={{ height: 420, borderRadius: 16 }} />
    </main>
  );
}
