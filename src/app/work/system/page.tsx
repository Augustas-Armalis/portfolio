"use client";

// The design system at a glance: every primitive and state. Unlinked; for review.
import { ArrowUpRight, Bell, Image as ImageIcon, Mail, Play, Plus, Search as SearchIcon, Settings2, Wifi } from "lucide-react";
import { useState } from "react";
import { Badge, Btn, InfoGrid, IconTile, List, ListRow, SearchField, SectionHeader, Segmented, Squircle, StatsRow, Switch, glass, useGlassScope, type BtnVariant } from "@/components/ui";
import { AppIcon } from "@/components/icons";

const variants: BtnVariant[] = ["prominent", "bordered", "tinted", "plain"];

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="py-8 shadow-[inset_0_-0.5px_0_var(--separator)]">
      <h2 className="t-title2 mb-4 text-[var(--label)]">{title}</h2>
      {children}
    </section>
  );
}

export default function System() {
  useGlassScope();
  const [on, setOn] = useState(true);
  const [seg, setSeg] = useState<"a" | "b" | "c">("a");
  const [q, setQ] = useState("");
  return (
    <main className="min-h-screen bg-[var(--bg-grouped)] text-[var(--label)]">
      <div className="mx-auto max-w-[920px] px-6 py-12">
        <div className="eyebrow text-[var(--label-2)]">Augustas OS</div>
        <h1 className="t-large">Design system</h1>
        <p className="t-body mt-1 max-w-[56ch] text-[var(--label-2)]">One accent, semantic greys, squircle corners on every surface, one button, one motion language.</p>

        <Block title="Type">
          <div className="space-y-1">
            <div className="t-large">Large Title 34</div>
            <div className="t-title1">Title 1 28</div>
            <div className="t-title2">Title 2 22</div>
            <div className="t-title3">Title 3 20</div>
            <div className="t-headline">Headline 17</div>
            <div className="t-body">Body 17. The quick brown fox jumps over the lazy dog.</div>
            <div className="t-sub text-[var(--label-2)]">Subheadline 15, secondary label</div>
            <div className="t-foot text-[var(--label-2)]">Footnote 13</div>
            <div className="m-headline pt-3">macOS Headline 13</div>
            <div className="m-body">macOS Body 13. Sidebars, menus, toolbars and lists.</div>
            <div className="m-sub text-[var(--label-2)]">macOS Subheadline 11</div>
          </div>
        </Block>

        <Block title="Colour">
          <div className="grid grid-cols-4 gap-3 sm:grid-cols-8">
            {["--accent", "--label", "--label-2", "--label-3", "--separator-opaque", "--bg-grouped", "--fill", "--bg-sidebar"].map((c) => (
              <div key={c}>
                <Squircle radius={12} className="h-14 shadow-[var(--shadow-1)]" style={{ background: `var(${c})` }} />
                <div className="t-cap mt-1.5 text-[var(--label-2)]">{c.slice(2)}</div>
              </div>
            ))}
          </div>
        </Block>

        <Block title="Buttons">
          <div className="space-y-4">
            {(["sm", "md", "lg"] as const).map((size) => (
              <div key={size} className="flex flex-wrap items-center gap-3">
                <span className="t-foot w-8 text-[var(--label-2)]">{size}</span>
                {variants.map((v) => (
                  <Btn key={v} variant={v} size={size} icon={<Plus size={size === "lg" ? 18 : 14} />}>
                    {v[0].toUpperCase() + v.slice(1)}
                  </Btn>
                ))}
                <Btn variant="prominent" size={size} capsule>
                  Get
                </Btn>
                <Btn variant="bordered" size={size} iconOnly label="Settings" icon={<Settings2 size={size === "lg" ? 18 : 14} />} />
                <Btn variant="bordered" size={size} disabled>
                  Disabled
                </Btn>
              </div>
            ))}
            <div className="relative overflow-hidden rounded-[16px] bg-[url(/wallpapers/founder-mountain-glow.jpg)] bg-cover bg-center p-6">
              <div className="flex flex-wrap items-center gap-3">
                <Btn variant="glass" capsule icon={<Play size={14} />}>
                  Glass
                </Btn>
                <Btn variant="glass-dark" capsule icon={<ArrowUpRight size={14} />}>
                  Glass dark
                </Btn>
                <Btn variant="glass" iconOnly capsule label="Search" icon={<SearchIcon size={15} />} />
              </div>
            </div>
          </div>
        </Block>

        <Block title="Controls">
          <div className="flex flex-wrap items-center gap-4">
            <Segmented
              id="sys"
              value={seg}
              onChange={setSeg}
              options={[
                { value: "a", label: "Day" },
                { value: "b", label: "Week" },
                { value: "c", label: "Month" },
              ]}
            />
            <Switch on={on} onChange={setOn} label="Example" />
            <SearchField id="sys-search" value={q} onChange={setQ} />
            <Badge>Badge</Badge>
            <Badge tone="live">Live</Badge>
            <Badge tone="ink">New</Badge>
          </div>
        </Block>

        <Block title="Lists">
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <SectionHeader>iOS inset grouped</SectionHeader>
              <List>
                <ListRow icon={<IconTile color="#007AFF"><Wifi size={17} /></IconTile>} title="Wi-Fi" detail="Home" chevron onClick={() => {}} />
                <ListRow icon={<IconTile color="#FF3B30"><Bell size={17} /></IconTile>} title="Notifications" chevron onClick={() => {}} />
                <ListRow icon={<IconTile color="#34C759"><Mail size={17} /></IconTile>} title="Mail" sub="Two accounts" chevron onClick={() => {}} />
              </List>
            </div>
            <div>
              <SectionHeader mac>macOS grouped form</SectionHeader>
              <List mac>
                <ListRow mac icon={<IconTile size={22} color="#8E8E93"><Settings2 size={13} /></IconTile>} title="General" chevron onClick={() => {}} />
                <ListRow mac icon={<IconTile size={22} color="#5856D6"><ImageIcon size={13} /></IconTile>} title="Wallpaper" detail="Mountain glow" onClick={() => {}} />
              </List>
            </div>
          </div>
        </Block>

        <Block title="Stats and information">
          <Squircle radius={16} className="bg-white p-5 shadow-[var(--shadow-1)]">
            <StatsRow
              stats={[
                { k: "Posts a day", v: "2" },
                { k: "Role", v: "Founder" },
                { k: "Since", v: "2026" },
              ]}
            />
            <div className="mt-4">
              <InfoGrid
                rows={[
                  { k: "Role", v: "Founder" },
                  { k: "When", v: "2026 – now" },
                  { k: "Built with", v: "Next.js, Cloudflare" },
                  { k: "Website", v: "larpo.studio" },
                ]}
              />
            </div>
          </Squircle>
        </Block>

        <Block title="Surfaces and squircles">
          <div className="flex flex-wrap items-end gap-6">
            {[6, 12, 16, 22].map((r) => (
              <div key={r} className="text-center">
                <Squircle radius={r} className="h-24 w-24 bg-white shadow-[var(--shadow-2)]" />
                <div className="t-cap mt-2 text-[var(--label-2)]">{r}px</div>
              </div>
            ))}
            <AppIcon id="larpo" size={60} />
            <div data-glass="" className={`${glass("pop")} rounded-[16px] px-5 py-4`}>
              <div className="m-headline">Popover glass</div>
              <div className="m-sub text-[var(--label-2)]">Menus, Spotlight, Control Center</div>
            </div>
          </div>
        </Block>

        <Block title="Motion">
          <p className="t-sub text-[var(--label-2)]">
            Springs: SPRING (no bounce, 0.42s) for UI, SPRING_SOFT (0.12 bounce, 0.55s) for cards and sheets. CSS: --ease-out with 120, 200 or 320ms. Press scales to 0.97. Only transform and opacity animate.
          </p>
        </Block>
      </div>
    </main>
  );
}
