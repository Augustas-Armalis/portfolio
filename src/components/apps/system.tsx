"use client";

// Trash, About, Terminal, Catch and System Settings.

import { motion } from "motion/react";
import { Check, Gauge, Info, Power, Send, Trash2, Undo2, UserRound, Wallpaper, Contrast } from "lucide-react";
import { Sym } from "../symbols";
import { useEffect, useRef, useState } from "react";
import { about, apps, desktopItems, allApps, owner, projectApps, timeline, wallpapers, type AppId } from "@/content";
import MusicShader from "../scene/MusicShader";
import { DeskArt, Monogram } from "../shell";
import { useOS, useWallpaperIndex } from "@/store";
import { FPS_CHOICES, FPS_LABELS, PRESET_LABELS, QUALITY_LABELS, RES_LABELS, setFrameCap, setQualityChoice, setQualityLevel, setResolution, useQuality, useQualityChoice, useQualitySettings, type Preset, type QualityChoice, type Res } from "@/lib/quality";
import { Btn, Button, IconTile, List, ListRow, M, SectionHeader, Squircle, sfx, useContextMenu, SplitView, Switch, Toolbar, useChrome } from "../ui";
import { Empty, useOpenApp } from "./shared";
import { useSound } from "./sound";
import { MUSIC_CREDITS } from "@/lib/musicCredits";

export function TrashApp() {
  const trash = useOS((s) => s.trash);
  const putBack = useOS((s) => s.putBack);
  const emptyTrash = useOS((s) => s.emptyTrash);
  const ctx = useContextMenu();
  const [sel, setSel] = useState<string | null>(null);
  const items = trash.map((id) => desktopItems.find((d) => d.id === id)).filter((x): x is NonNullable<typeof x> => !!x);
  return (
    <div className="flex h-full min-h-0 flex-col" onPointerDown={() => setSel(null)}>
      <Toolbar title="Trash" sub={items.length ? `${items.length} item${items.length > 1 ? "s" : ""}` : undefined}>
        {sel && (
          <Button size="sm" icon={<Sym icon={Undo2} size={14} weight="medium" />} onClick={() => (putBack([sel]), setSel(null))}>
            Put Back
          </Button>
        )}
        <Button size="sm" icon={<Sym icon={Trash2} size={14} weight="medium" />} onClick={() => items.length && (emptyTrash())}>
          Empty
        </Button>
      </Toolbar>
      {items.length ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] content-start gap-y-3 overflow-auto p-4">
          {items.map((it) => (
            <button
              type="button"
              key={it.id}
              onPointerDown={(e) => (e.stopPropagation(), setSel(it.id))}
              onDoubleClick={() => (putBack([it.id]))}
              onContextMenu={(e) => {
                setSel(it.id);
                ctx.open(e, [{ label: "Put Back", icon: Undo2, run: () => (putBack([it.id])) }, "sep", { label: "Empty Trash", icon: Trash2, run: () => (emptyTrash()) }]);
              }}
              className="flex flex-col items-center gap-1 outline-none"
            >
              <span data-sq="" className={`flex h-[78px] w-[78px] items-center justify-center rounded-[16px] ${sel === it.id ? "bg-[var(--selection)]" : ""}`}>
                <DeskArt item={it} />
              </span>
              <span className={`line-clamp-2 max-w-[92px] rounded-[7px] px-[6px] py-px text-center text-[12px] font-medium leading-[15px] ${sel === it.id ? "bg-[var(--accent)] text-white" : "text-ink"}`}>{it.name}</span>
            </button>
          ))}
        </div>
      ) : (
        <Empty icon={<Sym icon={Trash2} size={22} weight="medium" />} title="Trash is empty" body="Drag an item from the desktop onto the Trash in the Dock." />
      )}
      {ctx.node}
    </div>
  );
}

// ---------- About (spec sheet) ----------

export function About() {
  const { compact } = useChrome();
  const openContact = useOpenApp("contact");
  const openSettings = useOpenApp("settings");
  const moreInfo = () => {
    useOS.getState().setSettingsPane("about");
    openSettings();
  };
  return (
    // laid out like About This Mac: the machine (here, the person), its name, a short spec sheet, two buttons, the fine print
    <div data-drag className={`flex h-full flex-col items-center overflow-auto bg-[var(--bg)] px-6 text-center ${compact ? "pb-14 pt-2" : "pb-5 pt-11"}`}>
      <Monogram size={96} />
      <h2 className={`mt-5 text-ink ${compact ? "t-large" : "m-large"}`}>{owner.name}</h2>
      <p className={`mt-1 text-ink-2 ${compact ? "t-sub" : "m-body"}`}>{owner.role}</p>
      <p className={`mt-4 max-w-[290px] text-ink-2 [text-wrap:pretty] ${compact ? "t-foot" : "text-[12px] leading-[17px]"}`}>{about.intro}</p>
      <dl className={`mt-5 grid w-full max-w-[290px] grid-cols-[88px_1fr] gap-x-3 gap-y-[6px] ${compact ? "t-foot" : "text-[12px] leading-[16px]"}`}>
        {about.facts.map((r) => (
          <div key={r.label} className="contents">
            <dt className="text-right font-medium text-ink">{r.label}</dt>
            <dd className="text-left text-ink-2">{r.value}</dd>
          </div>
        ))}
      </dl>
      {compact ? (
        <div className="mt-8 flex w-full max-w-[320px] flex-col gap-2.5">
          <Btn variant="prominent" size="lg" capsule onClick={moreInfo} icon={<Sym icon={Info} size={17} weight="medium" />}>
            More Info
          </Btn>
          <Btn variant="tinted" size="lg" capsule onClick={openContact} icon={<Sym icon={Send} size={16} weight="medium" />}>
            Get in Touch
          </Btn>
        </div>
      ) : (
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button size="sm" onClick={moreInfo}>
            More Info…
          </Button>
          <Button size="sm" onClick={openContact}>
            Get in Touch…
          </Button>
        </div>
      )}
      <p className="mt-auto pt-6 text-[10px] leading-[14px] text-ink-3">
        ™ and © {new Date().getFullYear()} {owner.name}.
        <br />
        All rights reserved.
      </p>
    </div>
  );
}

// More Info: Settings' About pane. Who he is, the facts, the tools, and the timeline.
function AboutPane() {
  const { compact } = useChrome();
  const openAny = (id: AppId) => {
    const st = useOS.getState();
    if (st.isMobile) st.openPhoneApp(id);
    else st.open(id);
  };
  const rows = (list: { label: string; value: string }[], stack = compact && list.some((r) => r.value.length > 18)) => (
    <List mac={!compact}>
      {list.map((r) => (
        // on a phone, a list with a long value in it puts every value under its label, where it can wrap: neither is
        // ever cut to "Desi…", and the rows of one list all read the same way
        stack ? (
          <div key={r.label} className="list-row">
            <span className="list-body !block py-2.5">
              <span className="t-foot block text-[var(--label-2)]">{r.label}</span>
              <span className="t-body block text-[var(--label)] [text-wrap:pretty]">{r.value}</span>
            </span>
          </div>
        ) : (
          <ListRow mac={!compact} key={r.label} title={r.label} detail={<span className="block max-w-[26ch] truncate @md:max-w-[44ch]">{r.value}</span>} />
        )
      ))}
    </List>
  );
  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center px-4 pb-1 text-center">
        <Monogram size={compact ? 84 : 72} />
        <h2 className={`mt-3 text-ink ${compact ? "t-title3" : "text-[20px] font-semibold leading-6 tracking-[-0.02em]"}`}>{about.name}</h2>
        <p className={`mt-0.5 text-ink-2 ${compact ? "t-sub" : "m-body"}`}>
          {owner.role}. {owner.city}.
        </p>
        <p className={`mt-3 max-w-[52ch] text-ink-2 [text-wrap:pretty] ${compact ? "t-sub" : "text-[13px] leading-[19px]"}`}>{about.intro}</p>
      </div>
      {[
        { k: "Story", v: about.story },
        { k: "Goals", v: about.goals },
      ].map((x) => (
        <div key={x.k}>
          <SectionHeader mac={!compact}>{x.k}</SectionHeader>
          <p className={`max-w-[56ch] px-1 text-ink [text-wrap:pretty] ${compact ? "t-sub" : "text-[13px] leading-[19px]"}`}>{x.v}</p>
        </div>
      ))}
      {rows(about.facts)}
      <div>
        <SectionHeader mac={!compact}>Tools</SectionHeader>
        {rows(about.tools)}
      </div>
      <div>
        <SectionHeader mac={!compact}>Timeline</SectionHeader>
        <List mac={!compact} className={compact ? "px-4 py-3" : "px-4 py-3.5"}>
          <ol>
            {timeline.map((m, i) => {
              const last = i === timeline.length - 1;
              const body = (
                <>
                  <span className={`block text-ink-3 ${compact ? "t-foot" : "m-sub"} tabular-nums`}>{m.when}</span>
                  <span className={`block text-ink ${compact ? "t-headline" : "m-headline"} mt-0.5`}>{m.title}</span>
                  {m.body && <span className={`mt-0.5 block text-ink-2 [text-wrap:pretty] ${compact ? "t-sub" : "text-[12px] leading-[17px]"}`}>{m.body}</span>}
                </>
              );
              return (
                <li key={m.title} className="relative flex gap-3.5">
                  {/* the rail */}
                  <span className="relative flex w-[9px] shrink-0 justify-center">
                    {!last && <span className="absolute bottom-0 top-[14px] w-px bg-[var(--separator-opaque)]" />}
                    <span className={`relative mt-[5px] h-[9px] w-[9px] rounded-full ${m.key ? "bg-[var(--accent)]" : "bg-[var(--bg-elevated)] shadow-[inset_0_0_0_1.5px_var(--label-3s)]"}`} />
                  </span>
                  {m.app ? (
                    <button type="button" onClick={() => openAny(m.app!)} className={`press-row -mx-2 min-w-0 flex-1 rounded-[10px] px-2 text-left ${last ? "" : "mb-4"}`}>
                      {body}
                    </button>
                  ) : (
                    <span className={`min-w-0 flex-1 ${last ? "" : "mb-4"}`}>{body}</span>
                  )}
                </li>
              );
            })}
          </ol>
        </List>
      </div>
    </div>
  );
}

// ---------- shared ----------

export function Terminal() {
  const { open, setSound, sound, openPhoneApp, isMobile } = useOS();
  const [lines, setLines] = useState<string[]>(() => [
    `Last login: ${new Date().toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).replace(/,/g, "")} on ttys000`,
    'Type "help" to see what you can do.',
  ]);
  const [v, setV] = useState("");
  const { compact } = useChrome();
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  // what was typed before, for the up and down arrows
  const past = useRef<string[]>([]);
  const at = useRef(0);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [lines]);

  const all: AppId[] = [...allApps, ...projectApps.filter((a) => !allApps.includes(a))];
  const run = (raw: string) => {
    const [cmd, arg] = raw.trim().split(/\s+/);
    const out: string[] = [];
    switch (cmd) {
      case "":
        break;
      case "help":
        out.push(
          "whoami          who runs this machine",
          "ls              apps on this machine",
          "open <app>      open an app",
          "sound on|off    toggle sound",
          "clear           clear the screen",
        );
        break;
      case "whoami":
        out.push(`${owner.name}. ${owner.role}, ${owner.city}.`);
        break;
      case "ls":
        out.push(all.map((a) => apps[a].title.toLowerCase().split(" ")[0]).join("   "));
        break;
      case "open": {
        const id = all.find((a) => a === arg || apps[a].title.toLowerCase().startsWith(arg ?? "~"));
        if (id) {
          if (isMobile) openPhoneApp(id);
          else open(id);
          out.push(`Opening ${apps[id].title}`);
        } else out.push(`open: no app called "${arg ?? ""}". Try ls.`);
        break;
      }
      case "sound": {
        const next = arg ? arg === "on" : !sound;
        setSound(next);
        out.push(`Sound ${next ? "on" : "off"}`);
        break;
      }
      case "clear":
        setLines([]);
        return;
      default:
        out.push(`zsh: command not found: ${cmd}`);
    }
    setLines((l) => [...l, `augustas@os ~ % ${raw}`, ...out]);
  };

  return (
    <div onClick={() => !compact && input.current?.focus()} className={`terminal on-dark flex h-full min-h-[260px] flex-col bg-[#1C1D20] leading-[1.6] text-[#E4E6EA] ${compact ? "pb-24 text-[13px]" : "text-[12px]"}`}>
      <Toolbar title={<span className="text-white/80">Terminal</span>} sub={<span className="text-white/60">zsh</span>} />
      <div className="min-h-0 flex-1 overflow-auto px-4 py-3 font-mono">
        {lines.map((l, i) => (
          <div key={i} className={`whitespace-pre-wrap ${l.startsWith("augustas@os") ? "text-white" : "text-[#A9ADB5]"}`}>
            {l}
          </div>
        ))}
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (v.trim()) past.current.push(v);
            at.current = past.current.length;
            run(v);
            setV("");
          }}
        >
          <span className="shrink-0 text-white">augustas@os ~ %</span>
          <input
            id="terminal-input"
            ref={input}
            autoFocus={!isMobile}
            value={v}
            onChange={(e) => setV(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
              e.preventDefault();
              at.current = Math.max(0, Math.min(past.current.length, at.current + (e.key === "ArrowUp" ? -1 : 1)));
              setV(past.current[at.current] ?? "");
            }}
            aria-label="Command"
            enterKeyHint="go"
            autoCorrect="off"
            className="min-w-0 flex-1 bg-transparent text-[16px] text-white caret-[#E4E6EA] outline-none sm:text-[12px]"
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
          />
        </form>
        <div ref={end} />
      </div>
      {/* on the phone the commands are one tap away, above the home indicator */}
      {compact && (
        <div data-glass="" className="glass glass-btn-dark no-scrollbar fixed inset-x-3 bottom-[calc(var(--phone-bottom)+2px)] z-[30] flex h-[52px] items-center gap-1.5 overflow-x-auto overscroll-contain rounded-full px-2">
          {["help", "whoami", "ls", "open projects", "open records", "sound", "clear"].map((c) => (
            <button
              type="button"
              key={c}
              onClick={(e) => {
                e.stopPropagation();
                run(c);
              }}
              className="glass-press h-9 shrink-0 rounded-full bg-white/[0.12] px-3.5 font-mono text-[13px] text-white"
            >
              {c}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Game() {
  const [score, setScore] = useState(0);
  const [left, setLeft] = useState(0);
  const [pos, setPos] = useState({ x: 50, y: 50 });
  const best = useRef(0);
  const running = left > 0;
  useEffect(() => {
    if (!running) return;
    const iv = window.setInterval(() => setLeft((l) => l - 1), 1000);
    return () => window.clearInterval(iv);
  }, [running]);
  if (!running && score > best.current) best.current = score;
  const move = () => setPos({ x: 10 + Math.random() * 80, y: 15 + Math.random() * 70 });
  return (
    <div className="flex h-full min-h-[280px] flex-col">
      <Toolbar title="Catch" sub={running ? `${left}s left` : `Best ${best.current}`}>
        <span className="text-[13px] font-semibold tabular-nums text-ink">{score}</span>
      </Toolbar>
      <div className="relative m-3 flex-1 overflow-hidden rounded-[16px] bg-[#F7F7F9] ring-1 ring-black/[0.05]">
        {running ? (
          <motion.button
            type="button"
            aria-label="Catch the dot"
            onPointerDown={() => {
              setScore((s) => s + 1);
              move();
            }}
            animate={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            transition={M.pop}
            className="absolute h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink shadow-[0_6px_16px_-6px_rgb(0_0_0/0.5)]"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
            <div className="text-[14px] font-semibold text-ink">{score ? `You caught ${score}` : "Catch the dot"}</div>
            <div className="text-[12px] text-ink-2">Tap it as many times as you can in 15 seconds.</div>
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                setScore(0);
                setLeft(15);
                move();
              }}
            >
              {score ? "Play again" : "Start"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Settings: Sound ----------
// One fader row, as macOS draws it: what it is, a quiet speaker, the slider, a loud speaker, and a mute button
// (one glyph, tinted while it is on). On a phone the name sits over the slider so the slider gets the whole width.
function Level({ label, sub, value, onChange, muted, onMute, compact }: { label: string; sub?: string; value: number; onChange: (v: number) => void; muted?: boolean; onMute?: (m: boolean) => void; compact: boolean }) {
  const shown = muted ? 0 : value;
  const pct = Math.round(shown * 100);
  const slider = (
    <span className={`flex min-w-0 flex-1 items-center text-[var(--label-2)] ${compact ? "gap-3" : "gap-2"}`}>
      <Sym icon={shown === 0 ? "speakerOff" : "speaker1"} size={compact ? 20 : 15} />
      <input
        type="range"
        aria-label={label}
        aria-valuetext={`${pct}%`}
        min={0}
        max={1}
        step={0.01}
        value={shown}
        onChange={(e) => onChange(+e.target.value)}
        className="vol min-w-0 flex-1"
        style={{ ["--p" as string]: `${pct}%` }}
      />
      <Sym icon="speaker2" size={compact ? 20 : 15} />
    </span>
  );
  const mute = onMute && (
    <Btn variant={muted ? "tinted" : "plain"} size={compact ? "md" : "sm"} iconOnly label={muted ? `Unmute ${label}` : `Mute ${label}`} onClick={() => onMute(!muted)} icon={<Sym icon="speakerOff" size={compact ? 19 : 15} weight="medium" />} />
  );
  if (compact)
    return (
      <div className="list-row">
        <span className="list-body !block py-3">
          <span className="flex items-center justify-between gap-3">
            <span className="min-w-0">
              <span className="t-body block text-[var(--label)]">{label}</span>
              {sub && <span className="t-foot block text-[var(--label-2)] [text-wrap:pretty]">{sub}</span>}
            </span>
            <span className="t-sub shrink-0 tabular-nums text-[var(--label-2)]">{muted ? "Muted" : `${pct}%`}</span>
          </span>
          <span className="mt-2 flex items-center gap-2">
            {slider}
            {mute}
          </span>
        </span>
      </div>
    );
  return (
    <div className="list-row">
      <span className="list-body !min-h-[44px]">
        <span className="w-[150px] shrink-0">
          <span className="m-body block truncate text-[var(--label)]">{label}</span>
          {sub && <span className="m-sub block truncate text-[var(--label-2)]">{sub}</span>}
        </span>
        {slider}
        <span className="m-sub w-[38px] shrink-0 text-right tabular-nums text-[var(--label-2)]">{muted ? "Muted" : `${pct}%`}</span>
        <span className="flex w-7 shrink-0 justify-end">{mute}</span>
      </span>
    </div>
  );
}

// Output, the field (its music and its ambience) and the Music app, with a way back to the levels the site was
// mixed at. Every level goes through apps/sound.ts, the one file that knows where each of them lives.
function SoundPane({ compact }: { compact: boolean }) {
  const s = useSound();
  const note = `mt-2 text-ink-3 ${compact ? "t-foot px-4" : "m-sub px-1"}`;
  return (
    <div className="space-y-6">
      <div>
        <SectionHeader mac={!compact}>Output</SectionHeader>
        <List mac={!compact}>
          <Level compact={compact} label="Output volume" value={s.output} onChange={s.setOutput} muted={s.muted} onMute={s.setMuted} />
        </List>
        <p className={note}>Everything this site plays: the field, the flight, the piano and the Music app.</p>
      </div>
      <div>
        <SectionHeader mac={!compact}>The field</SectionHeader>
        <List mac={!compact}>
          <Level compact={compact} label="Music" sub="In the field and in flight" value={s.music} onChange={s.setMusic} />
          <Level compact={compact} label="Ambience" sub="Wind, waves and birds" value={s.ambience} onChange={s.setAmbience} />
        </List>
        <p className={note}>70% is how they were mixed; above it they are a little louder.</p>
        {/* the music the scene plays, as its licences ask it to be credited */}
        {MUSIC_CREDITS.length > 0 && <p className={note} data-sound="credits">Music: {MUSIC_CREDITS.join("; ")}.</p>}
      </div>
      <div>
        <SectionHeader mac={!compact}>Music app</SectionHeader>
        <List mac={!compact}>
          <Level compact={compact} label="Records" sub="His recordings" value={s.player} onChange={s.setPlayer} />
        </List>
      </div>
      <div className={`flex items-center justify-between gap-4 ${compact ? "px-4" : "px-1"}`}>
        <p className={`text-ink-3 ${compact ? "t-foot" : "m-sub"}`}>The interface itself is silent: no clicks, no alerts.</p>
        <Btn size={compact ? "md" : "sm"} disabled={!s.changed} onClick={s.reset}>
          Reset
        </Btn>
      </div>
    </div>
  );
}

// whether this browser will give a WebGL context at all (asked once): the live wallpaper's preview is a shader
let webgl: boolean | null = null;
function canWebGL() {
  if (webgl !== null) return webgl;
  try {
    const c = document.createElement("canvas");
    webgl = !!(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    webgl = false;
  }
  return webgl;
}

export function SettingsApp() {
  const wallpaper = useWallpaperIndex();
  const { sound, setSound, setWallpaper, appearance, setAppearance, reduceEffects, setReduceEffects, shutdown } = useOS();
  const { compact } = useChrome();
  const sel = useOS((s) => s.settingsPane);
  const setSel = useOS((s) => s.setSettingsPane);
  // opened from About's More Info: the phone starts on the pane, not the list
  const [startPushed] = useState(sel === "about");
  const choice = useQualityChoice();
  const qs = useQualitySettings();
  const quality = useQuality();
  const tile = (color: string, icon: React.ReactNode) => (
    <IconTile color={color} size={compact ? 29 : 20}>
      {icon}
    </IconTile>
  );
  const sz = compact ? 18 : 13;
  const looks: { v: "light" | "dark" | "auto"; label: string }[] = [
    { v: "light", label: "Light" },
    { v: "dark", label: "Dark" },
    { v: "auto", label: "Auto" },
  ];
  const pane =
    sel === "about" ? (
      <AboutPane />
    ) : sel === "appearance" ? (
      <div className="space-y-6">
        <div>
          <SectionHeader mac={!compact}>Appearance</SectionHeader>
          <List mac={!compact} className="p-4">
            <div className="grid grid-cols-3 gap-4">
              {looks.map((l) => {
                const on = appearance === l.v;
                return (
                  <button type="button" key={l.v} onClick={() => setAppearance(l.v)} aria-pressed={on} className="press flex flex-col items-center gap-2">
                    <Squircle
                      radius={12}
                      className={`relative aspect-[16/10] w-full overflow-hidden ${on ? "ring-[3px] ring-[var(--accent)] ring-offset-2 ring-offset-[var(--bg-elevated)]" : "shadow-[var(--shadow-1)]"}`}
                      style={{
                        background:
                          l.v === "light"
                            ? "linear-gradient(160deg,#eef0f4,#cfd5df)"
                            : l.v === "dark"
                              ? "linear-gradient(160deg,#2c2f38,#0e1014)"
                              : "linear-gradient(90deg,#e7eaf0 50%,#1a1c22 50%)",
                      }}
                    >
                      <span className={`absolute left-[12%] top-[16%] h-[54%] w-[64%] rounded-[7px] shadow-[0_4px_10px_-4px_rgb(0_0_0/0.4)] ${l.v === "dark" ? "bg-[#2c2c2e]" : "bg-[#fff]"}`}>
                        <span className="absolute left-[6px] top-[5px] flex gap-[3px]">
                          {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => (
                            <span key={c} className="h-[5px] w-[5px] rounded-full" style={{ background: c }} />
                          ))}
                        </span>
                      </span>
                    </Squircle>
                    <span className={`${compact ? "t-sub" : "m-body"} ${on ? "font-semibold text-ink" : "text-ink-2"}`}>{l.label}</span>
                  </button>
                );
              })}
            </div>
          </List>
        </div>
        <List mac={!compact}>
          <ListRow mac={!compact} icon={tile("#8E8E93", <Sym icon={Contrast} size={sz} weight="medium" />)} title="Reduce effects" sub="Solid surfaces instead of glass, gentler motion" detail={<Switch on={reduceEffects} onChange={setReduceEffects} label="Reduce effects" />} />
        </List>
      </div>
    ) : sel === "wallpaper" ? (
      <div>
        <SectionHeader mac={!compact}>{compact ? "Wallpaper" : "Desktop picture"}</SectionHeader>
        <List mac={!compact} className="p-3">
          <div className="grid grid-cols-2 gap-3 @md:grid-cols-3 @xl:grid-cols-4">
            {wallpapers.map((w, i) => {
              const on = wallpaper === i;
              const live = w.src.startsWith("live:");
              return (
                <button type="button" key={w.src} onClick={() => setWallpaper(i)} aria-pressed={on} className="press text-left">
                  <Squircle
                    radius={12}
                    className={`relative block aspect-[16/10] overflow-hidden bg-cover bg-center ${on ? "ring-[3px] ring-[var(--accent)] ring-offset-2 ring-offset-[var(--bg-elevated)]" : "shadow-[var(--shadow-1)]"} ${live ? "bg-[radial-gradient(120%_100%_at_28%_18%,#2c4a8c_0%,#14204a_42%,#070b16_100%)]" : ""}`}
                    style={live ? undefined : { backgroundImage: `url(${w.src})` }}
                  >
                    {/* the shader itself where the browser can draw it; the night gradient under it is the still */}
                    {live && canWebGL() && (
                      <span className="absolute inset-0">
                        <MusicShader intensity={0.6} palette="night" />
                      </span>
                    )}
                  </Squircle>
                  <span className="m-body mt-1.5 block truncate text-ink">{live ? "Live" : (w.name ?? w.by)}</span>
                  <span className="m-sub block truncate text-ink-3">{live ? "Follows the music" : w.by}</span>
                </button>
              );
            })}
          </div>
        </List>
      </div>
    ) : sel === "sound" ? (
      <SoundPane compact={compact} />
    ) : (
      // Graphics: the quality of the 3D world the desk sits in (src/lib/quality.ts, shared with the scene)
      <div>
        <SectionHeader mac={!compact}>3D world quality</SectionHeader>
        <List mac={!compact}>
          {(Object.keys(QUALITY_LABELS) as QualityChoice[]).map((c) => (
            <ListRow
              mac={!compact}
              key={c}
              onClick={() => setQualityChoice(c)}
              title={QUALITY_LABELS[c]}
              sub={c === "auto" ? `Follows this device, now ${QUALITY_LABELS[quality.preset]}` : undefined}
              detail={choice === c ? <Sym icon={Check} size={compact ? 18 : 14} className="text-[var(--accent-text)]" weight="bold" /> : undefined}
            />
          ))}
        </List>
        <p className={`mt-2 px-1 text-ink-3 ${compact ? "t-foot px-4" : "m-sub"}`}>{choice === "custom" ? "Custom: set below. " : ""}A preset sets everything below; changing any of them makes it custom.</p>
        {(
          [
            ["Resolution", (Object.keys(RES_LABELS) as Res[]).map((r) => [r, RES_LABELS[r], qs.res === r, () => setResolution(r)] as const)],
            ["Frame rate", FPS_CHOICES.map((f) => [String(f), FPS_LABELS[f], qs.fps === f, () => setFrameCap(f)] as const)],
            ["Quality", (["low", "medium", "high", "ultra"] as Preset[]).map((l) => [l, PRESET_LABELS[l], qs.level === l, () => setQualityLevel(l)] as const)],
          ] as const
        ).map(([head, rows]) => (
          <div key={head}>
            <SectionHeader mac={!compact}>{head}</SectionHeader>
            <List mac={!compact}>
              {rows.map(([k, t, on, go]) => (
                <ListRow mac={!compact} key={k} onClick={go} title={t} detail={on ? <Sym icon={Check} size={compact ? 18 : 14} className="text-[var(--accent-text)]" weight="bold" /> : undefined} />
              ))}
            </List>
          </div>
        ))}
      </div>
    );
  const title = { about: "About", appearance: "Appearance", wallpaper: "Wallpaper", sound: "Sound", graphics: "Graphics" }[sel] ?? "";
  return (
    <SplitView
      selected={sel}
      onSelect={setSel}
      startPushed={startPushed}
      footer={
        // (on the phone the power control is the first thing under the account row: see the header)
        compact ? undefined : (
        <List className="mt-8">
          <ListRow
            icon={tile("#FF3B30", <Sym icon={Power} size={sz} weight="medium" />)}
            title="Shut Down"
            onClick={() => {
              sfx("shutdown");
              shutdown();
            }}
          />
        </List>
        )
      }
      header={
        // the account row System Settings opens with
        compact ? (
          <>
            <List className="mt-2">
              <ListRow icon={<span className="my-4"><Monogram size={56} /></span>} title={<span className="t-title3">{owner.name}</span>} sub={owner.role} />
            </List>
            {/* the phone's power control, where it is seen at once: back to the desk, with the screen off */}
            <List className="mt-5">
              <ListRow
                icon={tile("#FF3B30", <Sym icon={Power} size={sz} weight="medium" />)}
                title="Power Off"
                sub="Back to the desk in the field"
                onClick={() => {
                  sfx("shutdown");
                  shutdown();
                }}
              />
            </List>
          </>
        ) : (
          // its picture starts on the same line as the rows' tiles below it
          <div className="flex items-center gap-2.5 px-1 pb-1">
            <Monogram size={36} />
            <span className="min-w-0">
              <span className="m-headline block truncate text-ink">{owner.name}</span>
              <span className="m-sub block truncate text-ink-2">{owner.city}</span>
            </span>
          </div>
        )
      }
      sections={[
        {
          items: [
            { id: "about", label: "About", icon: tile("#8E8E93", <Sym icon={UserRound} size={sz} weight="medium" />) },
            { id: "appearance", label: "Appearance", icon: tile("#48484A", <Sym icon={Contrast} size={sz} weight="medium" />) },
            { id: "wallpaper", label: "Wallpaper", icon: tile("#32ADE6", <Sym icon={Wallpaper} size={sz} weight="medium" />) },
            { id: "sound", label: "Sound", icon: tile("#FF2D55", <Sym icon="speaker2" size={sz} weight="medium" />) },
            { id: "graphics", label: "Graphics", icon: tile("#34C759", <Sym icon={Gauge} size={sz} weight="medium" />) },
          ],
        },
      ]}
      detail={
        <div className="@container flex min-h-full flex-col bg-[var(--bg-grouped)]">
          <Toolbar title={title} />
          <div className={compact ? "px-4 pb-8" : "p-6"}>{pane}</div>
        </div>
      }
    />
  );
}

// ---------- Finder: the folders (Projects, Games, Music, Photos, Documents) ----------
