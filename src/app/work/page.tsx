import Link from "next/link";
import { novel, owner, projectGroups, projects, tracks, apps } from "@/content";

export const metadata = {
  title: "Work",
  description:
    "Projects by Augustas Armalis: Larpo studio, Contles, Lunor, Filzy, Capto, AFilm, the Lab, music and a novel.",
  alternates: { canonical: "/work/" },
};

const Row = ({ name, line, meta }: { name: string; line?: string; meta?: string }) => (
  <li className="flex flex-col gap-0.5 border-t border-line py-3 sm:flex-row sm:items-baseline sm:gap-6">
    <span className="w-48 shrink-0 text-[15px] font-medium text-ink">{name}</span>
    <span className="flex-1 text-[14px] leading-relaxed text-ink-2">{line}</span>
    {meta && <span className="text-[12px] text-ink-2">{meta}</span>}
  </li>
);

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mt-12">
    <h2 className="mb-2 text-[12px] font-semibold text-ink-2">{title}</h2>
    <ul>{children}</ul>
  </section>
);

export default function Work() {
  return (
    <main className="min-h-screen bg-white px-[max(20px,env(safe-area-inset-left))] py-16 text-ink">
      <div className="mx-auto max-w-[760px]">
        <Link href="/" className="text-[13px] text-ink-2 hover:text-ink">
          ← Augustas OS
        </Link>
        <h1 className="mt-8 text-[40px] font-semibold leading-none tracking-[-0.04em]">{owner.name}</h1>
        <p className="mt-3 text-[16px] text-ink-2">
          {owner.role}, {owner.city}.
        </p>
        {projectGroups.map((g) => (
          <Section key={g.id} title={g.title}>
            {g.apps.map((a) => {
              const p = projects[a];
              return <Row key={a} name={p?.name ?? apps[a].title} line={p?.what ?? p?.role} meta={p?.years ?? p?.status ?? p?.stack} />;
            })}
          </Section>
        ))}
        <Section title="Music and writing">
          {tracks.map((t) => (
            <Row key={t.id} name={t.title} line={t.note} meta={`${t.durationLabel}, ${t.year}`} />
          ))}
          <Row name={novel.title} line={`Novel, illustrated by ${novel.illustrator}`} meta={novel.years} />
        </Section>
      </div>
    </main>
  );
}
