import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <section aria-labelledby="not-found-title" className="mx-auto max-w-2xl px-4 py-12">
      <h1 id="not-found-title" className="text-2xl font-semibold">
        Sayfa bulunamadı
      </h1>
      <p className="mt-2 text-fg-muted">Aradığın sayfa taşınmış ya da hiç var olmamış olabilir.</p>
      <Link to="/" className="mt-6 inline-block font-medium text-primary hover:text-primary-hover">
        Ana sayfaya dön
      </Link>
    </section>
  );
}
