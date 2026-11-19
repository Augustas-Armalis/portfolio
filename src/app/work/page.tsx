import Link from "next/link";
import { apps, labApps, mainWork, novel, otherWork, owner, projects, tracks, users } from "@/content";

export const metadata = { title: "Work – Augustas" };

const Row = ({ name, line, meta }: { name: string; line?: string; meta?: string }) => (
  <li className="flex flex-col gap-0.5 border-t border-line py-3 sm:flex-row sm:items-baseline sm:gap-6">
    <span className="w-48 shrink-0 text-[15px] font-medium text-ink">{name}</span>
    <span className="flex-1 text-[14px] leading-relaxed text-ink-2">{line}</span>
    {meta && <span className="text-[12px] text-ink-3">{meta}</span>}
  </li>
);

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mt-12">
    <h2 className="mb-2 text-[12px] font-semibold text-ink-3">{title}</h2>
    <ul>{children}</ul>
  </section>
);

export default function Work() {
  const founder = users.founder.apps.filter((a) => projects[a]);
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
        <Section title={users.engineer.name}>
          {[mainWork, ...otherWork].map((p) => (
            <Row key={p.id} name={p.name} line={p.what} meta={p.years} />
          ))}
        </Section>
        <Section title={users.founder.name}>
          {founder.map((a) => (
            <Row key={a} name={projects[a]!.name} line={projects[a]!.what ?? projects[a]!.role} meta={projects[a]!.status} />
          ))}
        </Section>
        <Section title="Lab">
          {labApps.map((a) => (
            <Row key={a} name={apps[a].title} line={projects[a]?.what} meta={projects[a]?.stack} />
          ))}
        </Section>
        <Section title={users.art.name}>
          {tracks.map((t) => (
            <Row key={t.id} name={t.title} line={t.note} meta={`${t.durationLabel}, ${t.year}`} />
          ))}
          <Row name={novel.title} line={`Novel, illustrated by ${novel.illustrator}`} meta={novel.years} />
        </Section>
      </div>
    </main>
  );
}
