/** Done items out of all items of a checklist: a bar that turns green when everything is done. */
export function ChecklistProgress({ done, total }: { done: number; total: number }) {
  if (total === 0) return null;
  const percent = Math.round((done / total) * 100);

  return (
    <div className="flex items-center gap-2">
      <span aria-hidden="true" className="w-9 text-xs text-fg-muted">{`${percent}%`}</span>
      <div
        role="progressbar"
        aria-label="Tamamlanan öğeler"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-valuetext={`${total} öğeden ${done}'si tamamlandı`}
        className="h-2 flex-1 overflow-hidden rounded-full bg-surface-sunken"
      >
        <div
          className={`h-full transition-[width] ${done === total ? 'bg-success' : 'bg-primary'}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
