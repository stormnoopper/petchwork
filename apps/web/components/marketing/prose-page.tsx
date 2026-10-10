type Props = {
  title: string;
  intro: string;
  updated?: string;
  children: React.ReactNode;
};

/** Simple readable layout for about / privacy / terms pages. */
export function ProsePage({ title, intro, updated, children }: Props) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-16">
      <header className="mb-8 space-y-4 border-b pb-6">
        <h1 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">{title}</h1>
        <p className="text-lg text-muted-foreground">{intro}</p>
        {updated ? <p className="text-base text-muted-foreground">{updated}</p> : null}
      </header>
      <div className="space-y-8 text-base leading-relaxed">{children}</div>
    </article>
  );
}

export function ListSection({ title, items }: { title: string; items: readonly string[] }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold">{title}</h2>
      <ul className="list-disc space-y-2 pl-6">
        {items.map((it) => (
          <li key={it}>{it}</li>
        ))}
      </ul>
    </section>
  );
}
