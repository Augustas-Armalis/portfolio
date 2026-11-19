"use client";

// Trash, About, Terminal, Catch and System Settings.

import { motion } from "motion/react";
import { ArrowUpRight, Check, Gauge, Send, Trash2, Undo2, Volume2, Wallpaper, Contrast, Palette } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { apps, desktopItems, allApps, owner, projectApps, spec, wallpapers, type AppId } from "@/content";
import MusicShader from "../scene/MusicShader";
import { DeskArt } from "../Desktop";
import { Monogram } from "../Login";
import { useOS, useWallpaperIndex } from "@/store";
import { QUALITY_LABELS, setQualityChoice, useQuality, useQualityChoice, type QualityChoice } from "@/lib/quality";
import { Btn, Button, IconTile, List, ListRow, SectionHeader, Squircle, useContextMenu, SplitView, Switch, Toolbar, useChrome } from "../ui";
import { Empty, useOpenApp } from "./shared";

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
          <Button size="sm" icon={<Undo2 size={14} />} onClick={() => (putBack([sel]), setSel(null))}>
            Put Back
          </Button>
        )}
        <Button size="sm" icon={<Trash2 size={14} />} onClick={() => items.length && (emptyTrash())}>
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
                ctx.open(e, [{ label: "Put Back", run: () => (putBack([it.id])) }, "sep", { label: "Empty Trash", run: () => (emptyTrash()) }]);
              }}
              className="flex flex-col items-center gap-1 outline-none"
            >
              <span className={`flex h-[72px] w-[72px] items-center justify-center rounded-[6px] ${sel === it.id ? "bg-black/[0.08]" : ""}`}>
                <DeskArt item={it} />
              </span>
              <span className={`line-clamp-2 max-w-[92px] rounded-[4px] px-[5px] py-px text-center text-[12px] leading-[15px] ${sel === it.id ? "bg-[#0A84FF] text-white" : "text-ink"}`}>{it.name}</span>
            </button>
          ))}
        </div>
      ) : (
        <Empty icon={<Trash2 size={22} />} title="Trash is empty" body="Drag an item from the desktop onto the Trash in the Dock." />
      )}
      {ctx.node}
    </div>
  );
}

// ---------- About (spec sheet) ----------

export function About() {
  const { compact } = useChrome();
  const openContact = useOpenApp("contact");
  return (
    // laid out like About This Mac: the machine (here, the person), its name, a short spec sheet, two buttons, the fine print
    <div data-drag className={`flex h-full flex-col items-center overflow-auto bg-[var(--bg)] px-6 text-center ${compact ? "pb-14 pt-2" : "pb-5 pt-11"}`}>
      <div className="relative flex h-[112px] w-[112px] items-center justify-center rounded-full bg-[radial-gradient(120%_120%_at_30%_15%,#ffffff_0%,#e9eaee_45%,#c9ccd3_100%)] text-[46px] font-semibold tracking-[-0.03em] text-[#17181b] shadow-[0_14px_34px_-14px_rgb(16_18_24/0.45),inset_0_-2px_6px_rgb(0_0_0/0.06),0_0_0_0.5px_rgb(0_0_0/0.08)]">
        A
      </div>
      <h1 className={`mt-5 text-ink ${compact ? "t-large" : "m-large"}`}>{owner.name}</h1>
      <p className={`mt-1 text-ink-2 ${compact ? "t-sub" : "m-body"}`}>{owner.role}</p>
      <dl className={`mt-6 grid w-full max-w-[290px] grid-cols-[96px_1fr] gap-x-3 gap-y-[6px] ${compact ? "t-foot" : "text-[12px] leading-[16px]"}`}>
        {spec.map((r) => (
          <div key={r.label} className="contents">
            <dt className="text-right font-medium text-ink">{r.label}</dt>
            <dd className="text-left text-ink-2">{r.value}</dd>
          </div>
        ))}
      </dl>
      {compact ? (
        <div className="mt-8 flex w-full max-w-[320px] flex-col gap-2.5">
          <Btn variant="prominent" size="lg" capsule onClick={openContact} icon={<Send size={16} />}>
            Get in Touch
          </Btn>
          <Btn variant="tinted" size="lg" capsule href={owner.studio.href} icon={<ArrowUpRight size={17} />}>
            {owner.studio.label}
          </Btn>
        </div>
      ) : (
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button size="sm" onClick={openContact} icon={<Send size={13} />}>
            Get in Touch…
          </Button>
          <Button size="sm" href={owner.studio.href} icon={<ArrowUpRight size={14} />}>
            More Info…
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
      <Toolbar title={<span className="text-white/80">Terminal</span>} sub={<span className="text-white/40">zsh</span>} />
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
        <div data-glass="" className="glass glass-btn-dark no-scrollbar fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+36px)] z-[30] flex h-[52px] items-center gap-1.5 overflow-x-auto overscroll-contain rounded-full px-2">
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
      <div className="relative m-3 flex-1 overflow-hidden rounded-[12px] bg-[#F7F7F9] ring-1 ring-black/[0.05]">
        {running ? (
          <motion.button
            type="button"
            aria-label="Catch the dot"
            onPointerDown={() => {
              setScore((s) => s + 1);
              move();
            }}
            animate={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            transition={{ type: "spring", bounce: 0.2, duration: 0.35 }}
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

export function SettingsApp() {
  const wallpaper = useWallpaperIndex();
  const { sound, setSound, setWallpaper, appearance, setAppearance, tintedIcons, setTintedIcons, reduceEffects, setReduceEffects } = useOS();
  const { compact } = useChrome();
  const [sel, setSel] = useState("appearance");
  const choice = useQualityChoice();
  const quality = useQuality();
  const tile = (color: string, icon: React.ReactNode) => (
    <IconTile color={color} size={compact ? 29 : 20}>
      {icon}
    </IconTile>
  );
  const sz = compact ? 17 : 12;
  const looks: { v: "light" | "dark" | "auto"; label: string }[] = [
    { v: "light", label: "Light" },
    { v: "dark", label: "Dark" },
    { v: "auto", label: "Auto" },
  ];
  const pane =
    sel === "appearance" ? (
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
                      radius={10}
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
                      <span className={`absolute left-[12%] top-[16%] h-[54%] w-[64%] rounded-[5px] shadow-[0_4px_10px_-4px_rgb(0_0_0/0.4)] ${l.v === "dark" ? "bg-[#2c2c2e]" : "bg-[#fff]"}`}>
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
          <ListRow mac={!compact} icon={tile("#5856D6", <Palette size={sz} />)} title="Tinted app icons" sub="Icons take the accent colour" detail={<Switch on={tintedIcons} onChange={setTintedIcons} label="Tinted app icons" />} />
          <ListRow mac={!compact} icon={tile("#8E8E93", <Contrast size={sz} />)} title="Reduce effects" sub="Solid surfaces instead of glass, gentler motion" detail={<Switch on={reduceEffects} onChange={setReduceEffects} label="Reduce effects" />} />
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
                    radius={10}
                    className={`relative block aspect-[16/10] overflow-hidden bg-cover bg-center ${on ? "ring-[3px] ring-[var(--accent)] ring-offset-2 ring-offset-[var(--bg-elevated)]" : "shadow-[var(--shadow-1)]"} ${live ? "bg-[#070b16]" : ""}`}
                    style={live ? undefined : { backgroundImage: `url(${w.src})` }}
                  >
                    {live && (
                      <span className="absolute inset-0">
                        <MusicShader intensity={0.6} palette="night" />
                      </span>
                    )}
                  </Squircle>
                  <span className="m-sub mt-1.5 block truncate text-ink-2">{live ? "Live, follows the music" : w.by}</span>
                </button>
              );
            })}
          </div>
        </List>
      </div>
    ) : sel === "sound" ? (
      <List mac={!compact}>
        <ListRow mac={!compact} icon={tile("#FF2D55", <Volume2 size={sz} />)} title="Play sound" sub="The startup chime and music" detail={<Switch on={sound} onChange={setSound} label="Play sound" />} />
      </List>
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
              detail={choice === c ? <Check size={compact ? 18 : 14} className="bold text-[var(--accent)]" /> : undefined}
            />
          ))}
        </List>
        <p className={`mt-2 px-1 text-ink-3 ${compact ? "t-foot px-4" : "m-sub"}`}>Applies to the desk and the field around it. Lower settings draw less grass, fewer effects and a softer picture.</p>
      </div>
    );
  const title = { appearance: "Appearance", wallpaper: "Wallpaper", sound: "Sound", graphics: "Graphics" }[sel] ?? "";
  return (
    <SplitView
      selected={sel}
      onSelect={setSel}
      header={
        // the account row System Settings opens with
        compact ? (
          <List className="mt-2">
            <ListRow icon={<span className="my-2"><Monogram size={56} /></span>} title={<span className="t-title3">{owner.name}</span>} sub={owner.role} />
          </List>
        ) : (
          <div className="flex items-center gap-2.5 px-2 pb-1">
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
            { id: "appearance", label: "Appearance", icon: tile("#48484A", <Contrast size={sz} />) },
            { id: "wallpaper", label: "Wallpaper", icon: tile("#32ADE6", <Wallpaper size={sz} />) },
            { id: "sound", label: "Sound", icon: tile("#FF2D55", <Volume2 size={sz} />) },
            { id: "graphics", label: "Graphics", icon: tile("#34C759", <Gauge size={sz} />) },
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
