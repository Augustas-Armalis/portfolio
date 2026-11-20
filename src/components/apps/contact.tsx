"use client";

// Get in Touch.

import { AnimatePresence, motion } from "motion/react";
import { Aperture, CalendarDays, Check, Copy, Github, Instagram, Linkedin, Mail, MessageCircle, Music2, Send } from "lucide-react";
import { Sym } from "../symbols";
import { useState } from "react";
import { bookCall, CONTACT_EMAIL, CONTACTS, contactList, type Channel, owner } from "@/content";
import { useOS } from "@/store";
import { Btn, Button, M, Toolbar, useChrome } from "../ui";
import { Monogram } from "../Login";
import { XMark, useCopied } from "./shared";

const channelIcon: Record<Channel["id"], React.ReactNode> = {
  email: <Sym icon={Mail} size={16} weight="medium" />,
  x: <XMark size={13} />,
  linkedin: <Sym icon={Linkedin} size={16} weight="medium" />,
  larpo: <Sym icon={Aperture} size={16} weight="medium" />,
  instagram: <Sym icon={Instagram} size={16} weight="medium" />,
  instagramStudio: <Sym icon={Instagram} size={16} weight="medium" />,
  github: <Sym icon={Github} size={16} weight="medium" />,
  spotify: <Sym icon={Music2} size={16} weight="medium" />,
};

// a channel without its real link yet points at "#" so it still looks and behaves finished
const hrefOf = (c: Channel) => c.href ?? "#";

export function Contact() {
  const { compact } = useChrome();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sent, setSent] = useState(false);
  const { copied, copy } = useCopied();
  const ready = `To: ${owner.name}\nSubject: ${subject.trim() || "Hello"}\n\n${body.trim() || "Hi Augustas,"}`;
  const send = () => {
    if (CONTACT_EMAIL) {
      window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      return;
    }
    copy("send", ready);
    setSent(true);
    useOS.getState().setActivity({ kind: "sent" });
  };
  const email = contactList.find((c) => c.id === "email")!;

  const sentNote = (
    <AnimatePresence>
      {sent && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, transition: M.out }}
          transition={M.fade}
          className={`flex items-center gap-2.5 rounded-[12px] bg-[#E9F6EE] px-3 py-2.5 text-[13px] text-[#1F7A45] ${compact ? "mx-4 mt-3" : ""}`}
        >
          <Sym icon={Check} size={15} className="shrink-0" weight="bold" />
          <span className="min-w-0 flex-1">Message copied. Paste it into X or any channel below.</span>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (compact) {
    const actions = [
      { k: "call", label: "Call", icon: <Sym icon={CalendarDays} size={20} weight="medium" />, href: bookCall.href },
      { k: "x", label: "X", icon: <XMark size={17} />, href: hrefOf(contactList.find((c) => c.id === "x")!) },
      { k: "mail", label: "Mail", icon: <Sym icon={Mail} size={20} weight="medium" />, href: hrefOf(email) },
    ];
    return (
      <div className="pb-10">
        <div className="flex flex-col items-center px-4 pt-1 text-center">
          <Monogram size={84} />
          <div className="mt-3 text-[22px] font-semibold tracking-[-0.02em] text-ink">{owner.name}</div>
          <div className="text-[15px] text-ink-2">{owner.role}</div>
        </div>
        <div className="mt-5 grid grid-cols-4 gap-2 px-4">
          {actions.map((a) => (
            <a key={a.k} href={a.href} target={a.href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="press flex h-[60px] flex-col items-center justify-center gap-1 rounded-[12px] bg-white text-[var(--accent-text)]">
              {a.icon}
              <span className="text-[11px] font-medium">{a.label}</span>
            </a>
          ))}
          <button type="button" onClick={() => copy("handle", owner.x.label)} className="press flex h-[60px] flex-col items-center justify-center gap-1 rounded-[12px] bg-white text-[var(--accent-text)]">
            {copied === "handle" ? <Sym icon={Check} size={20} weight="bold" /> : <Sym icon={Copy} size={20} weight="medium" />}
            <span className="text-[11px] font-medium">{copied === "handle" ? "Copied" : "Copy"}</span>
          </button>
        </div>
        <div className="mx-4 mt-6 sq-list overflow-hidden rounded-[12px] bg-white">
          {contactList.map((c, j) => (
            <a key={c.id} href={hrefOf(c)} target={c.href?.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="press-row flex min-h-[56px] items-center pl-4">
              <span className={`flex min-h-[56px] flex-1 flex-col justify-center pr-4 ${j ? "border-t-[0.5px] border-[#C6C6C8]" : ""}`}>
                {c.value !== c.label && <span className="text-[13px] text-ink">{c.label}</span>}
                <span className="text-[17px] tracking-[-0.02em] text-[var(--accent-text)]">{c.value}</span>
              </span>
            </a>
          ))}
        </div>
        <div className="mb-[7px] mt-7 px-8 text-[13px] uppercase tracking-[-0.005em] text-[#6D6D72]">New message</div>
        <div className="mx-4 sq-list overflow-hidden rounded-[12px] bg-white">
          <input
            id="contact-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            className="h-11 w-full bg-transparent px-4 text-[17px] tracking-[-0.02em] text-ink outline-none placeholder:text-[#C4C4C7]"
          />
          <div className="ml-4 border-t-[0.5px] border-[#C6C6C8]" />
          <textarea
            id="contact-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Message"
            rows={5}
            className="block w-full resize-none bg-transparent px-4 py-3 text-[17px] leading-[22px] tracking-[-0.02em] text-ink outline-none placeholder:text-[#C4C4C7]"
          />
        </div>
        <div className="mx-4 mt-4 sq-list overflow-hidden rounded-[12px] bg-white">
          <button type="button" onClick={send} className="press-row flex h-11 w-full items-center justify-center text-[17px] font-semibold tracking-[-0.02em] text-[var(--accent-text)]">
            Send Message
          </button>
        </div>
        {sentNote}
      </div>
    );
  }

  const field = "flex h-9 items-center gap-2 border-b border-black/[0.06] px-4 text-[13px]";
  return (
    <div className="@container/contact flex h-full min-h-0 flex-col">
      <Toolbar title="New Message">
        <Button size="sm" variant="primary" onClick={send} icon={copied === "send" ? <Sym icon={Check} size={14} weight="bold" /> : <Sym icon={Send} size={14} weight="medium" />}>
          {copied === "send" ? "Copied" : "Send"}
        </Button>
      </Toolbar>
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        {/* the contact card: who you're writing to, and the other ways to reach him */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-[var(--separator)] px-5 py-4">
          <Monogram size={56} />
          <div className="min-w-[150px] flex-1">
            <div className="m-title truncate text-ink">{owner.name}</div>
            <div className="m-body truncate text-ink-2">{owner.role}</div>
          </div>
          <div className="flex gap-3">
            {[
              { label: "message", icon: <Sym icon={MessageCircle} size={16} weight="medium" />, run: () => document.getElementById("contact-body")?.focus() },
              { label: "call", icon: <Sym icon={CalendarDays} size={16} weight="medium" />, href: bookCall.href },
              { label: "mail", icon: <Sym icon={Mail} size={16} weight="medium" />, href: hrefOf(email) },
              { label: "X", icon: <XMark size={13} />, href: owner.x.href },
            ].map((a) => (
              <div key={a.label} className="flex flex-col items-center gap-1">
                <Btn variant="tinted" capsule iconOnly size="md" label={a.label} href={a.href} onClick={a.run} icon={a.icon} className="!h-9 !w-9" />
                <span className="m-sub text-[var(--accent-text)]">{a.label}</span>
              </div>
            ))}
          </div>
        </div>
        <div className={field}>
          <span className="w-[58px] text-right text-ink-3">To:</span>
          <span className="inline-flex h-[22px] items-center rounded-[8px] bg-[#0A84FF]/[0.1] px-2 text-[13px] font-medium text-[var(--accent-text)]">{owner.name}</span>
        </div>
        <label htmlFor="contact-subject" className={field}>
          <span className="w-[58px] text-right text-ink-3">Subject:</span>
          <input
            id="contact-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="min-w-0 flex-1 bg-transparent text-ink outline-none"
            autoComplete="off"
          />
        </label>
        <textarea
          id="contact-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write a message"
          className="min-h-[150px] flex-1 resize-none bg-transparent px-4 py-3 text-[13px] leading-[20px] text-ink outline-none placeholder:text-ink-3"
        />
        <div className="space-y-3 border-t border-black/[0.06] bg-[#F7F7F9] p-4">
          {sentNote}
          <div className="grid grid-cols-3 gap-2 @max-[559px]/contact:grid-cols-1">
            <QuickAction href={bookCall.href} icon={<Sym icon={CalendarDays} size={16} weight="medium" />} label={bookCall.label} sub={bookCall.sub} />
            <QuickAction href={owner.x.href} icon={<XMark size={14} />} label="Message on X" sub={owner.x.label} />
            {CONTACT_EMAIL ? (
              <QuickAction
                onClick={() => copy("email", CONTACT_EMAIL ?? "")}
                icon={copied === "email" ? <Sym icon={Check} size={16} weight="bold" /> : <Sym icon={Copy} size={16} weight="medium" />}
                label={copied === "email" ? "Copied" : "Copy email"}
                sub={email.value}
              />
            ) : (
              <QuickAction href={CONTACTS.linkedin.href ?? "#"} icon={<Sym icon={Linkedin} size={16} weight="medium" />} label="LinkedIn" sub={CONTACTS.linkedin.value} />
            )}
          </div>
          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 @max-[459px]/contact:grid-cols-1">
            {contactList
              .filter((c) => c.id !== "x" && (CONTACT_EMAIL ? true : c.id !== "linkedin"))
              .map((c) => (
                <a
                  key={c.id}
                  href={hrefOf(c)}
                  target={c.href?.startsWith("http") ? "_blank" : undefined}
                  rel="noreferrer"
                  className="group flex h-8 items-center gap-2 rounded-[8px] px-2 text-[13px] hov:hover:bg-black/[0.04]"
                >
                  <span className="flex h-4 w-4 items-center justify-center text-ink-2">{channelIcon[c.id]}</span>
                  <span className="text-ink">{c.label}</span>
                  <span className="min-w-0 flex-1 truncate text-right text-ink-3">{c.value !== c.label ? c.value : ""}</span>
                </a>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickAction({ href, onClick, icon, label, sub }: { href?: string; onClick?: () => void; icon: React.ReactNode; label: string; sub: string }) {
  const cls = "press lift sq flex flex-col items-start gap-2 rounded-[20px] bg-[var(--bg-elevated)] p-3 text-left shadow-[var(--shadow-1)]";
  const inner = (
    <>
      <span className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-[var(--accent-tint)] text-[var(--accent-text)]">{icon}</span>
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-ink">{label}</span>
        <span className="block truncate text-[11px] text-ink-3">{sub}</span>
      </span>
    </>
  );
  if (href)
    return (
      <a href={href} target="_blank" rel="noreferrer" className={cls}>
        {inner}
      </a>
    );
  return (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

// ---------- Trash ----------
