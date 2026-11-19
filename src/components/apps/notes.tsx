"use client";

// Notes: a list of notes and the one that's open, like Apple Notes. Read only.

import { notes, type Note } from "@/content";
import { useOS } from "@/store";
import { SplitView, Toolbar, useChrome } from "../ui";

// the line under a note's title in the list: its first sentence
const preview = (n: Note) => {
  const b = n.blocks.find((x) => "p" in x || "list" in x);
  if (!b) return "";
  return "p" in b ? b.p : "list" in b ? b.list[0] : "";
};

function Page({ note }: { note: Note }) {
  const { compact } = useChrome();
  return (
    <article className={`mx-auto w-full max-w-[560px] ${compact ? "px-5 pb-16 pt-1" : "px-8 pb-10 pt-5"}`}>
      <div className={`text-center text-ink-3 ${compact ? "t-foot" : "m-sub"}`}>{note.date}</div>
      {!compact && <h1 className="m-large mt-3 text-ink">{note.title}</h1>}
      <div className={compact ? "mt-3" : "mt-2"}>
        {note.blocks.map((b, i) =>
          "h" in b ? (
            <h2 key={i} className={`mt-6 text-ink ${compact ? "t-headline" : "m-headline"}`}>
              {b.h}
            </h2>
          ) : "p" in b ? (
            <p key={i} className={`mt-2 text-ink [text-wrap:pretty] ${compact ? "t-body" : "text-[14px] leading-[22px] tracking-[-0.006em]"}`}>
              {b.p}
            </p>
          ) : (
            <ul key={i} className="mt-2">
              {b.list.map((l) => (
                <li key={l} className={`flex gap-2.5 text-ink ${compact ? "t-body py-[3px]" : "py-[2px] text-[14px] leading-[22px] tracking-[-0.006em]"}`}>
                  <span aria-hidden className={`shrink-0 rounded-full bg-[#F6B100] ${compact ? "mt-[9px] h-[6px] w-[6px]" : "mt-[8.5px] h-[5px] w-[5px]"}`} />
                  <span>{l}</span>
                </li>
              ))}
            </ul>
          ),
        )}
      </div>
    </article>
  );
}

export function Notes() {
  const id = useOS((s) => s.note);
  const setNote = useOS((s) => s.setNote);
  const note = notes.find((n) => n.id === id) ?? notes[0];
  return (
    <SplitView
      selected={note.id}
      onSelect={setNote}
      width={232}
      startPushed={id !== "now"}
      sections={[{ title: "Notes", items: notes.map((n) => ({ id: n.id, label: n.title, sub: preview(n) })) }]}
      detail={
        <div className="flex min-h-full flex-col">
          <Toolbar title="Notes" sub={`${notes.length} notes`} />
          <Page note={note} />
        </div>
      }
    />
  );
}
