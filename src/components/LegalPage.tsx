export const PUBLISHER = "Triaxis Ventures Private Limited";
export const SUPPORT_URL = "https://github.com/axxess-triaxis/port4lleo/issues";
export const LAST_UPDATED = "September 28, 2026";

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-1 text-sm text-ink-3">Last updated {LAST_UPDATED}</p>
      <div className="mt-8 space-y-6 text-[15px] leading-relaxed text-ink-2 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-ink [&_li]:ml-5 [&_li]:list-disc [&_a]:text-accent-ink [&_a]:underline">
        {children}
      </div>
    </article>
  );
}
