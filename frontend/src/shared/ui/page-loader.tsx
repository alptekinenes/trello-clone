/** Full-width loading message. <output> has the implicit "status" role, so it is announced. */
export function PageLoader({ label = 'Yükleniyor…' }: { label?: string }) {
  return (
    <output className="flex justify-center px-4 py-24 text-fg-muted">
      <span className="motion-safe:animate-pulse">{label}</span>
    </output>
  );
}
