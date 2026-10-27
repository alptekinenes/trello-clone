import { useApiHealth } from '../api/use-api-health';

function ApiStatus() {
  const { isPending, isError } = useApiHealth();

  if (isPending) {
    return <p className="text-fg-muted">API durumu kontrol ediliyor…</p>;
  }
  if (isError) {
    return (
      <p className="rounded-md bg-danger-subtle px-3 py-2 text-danger">
        API'ye ulaşılamıyor. Backend'in çalıştığından emin olun.
      </p>
    );
  }
  return <p className="rounded-md bg-success-subtle px-3 py-2 text-success">API çalışıyor.</p>;
}

export function HomePage() {
  return (
    <section aria-labelledby="home-title" className="mx-auto max-w-2xl px-4 py-12">
      <h1 id="home-title" className="text-2xl font-semibold">
        Panolarına hoş geldin
      </h1>
      <p className="mt-2 text-fg-muted">
        Proje iskeleti hazır. Giriş ve panolar sonraki adımlarda eklenecek.
      </p>
      <div className="mt-6" aria-live="polite">
        <ApiStatus />
      </div>
    </section>
  );
}
