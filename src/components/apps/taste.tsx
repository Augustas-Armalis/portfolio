"use client";

// Taste and Kit.

import { ListOrdered, Star } from "lucide-react";
import { useState } from "react";
import { taste } from "@/content";
import { Button, Group, List, ListRow, Row, Segmented, SplitView, Switch, Toolbar } from "../ui";

export function Taste() {
  const [sel, setSel] = useState("rules");
  const title = sel === "rules" ? "Rules" : "Designers I rate";
  const detail =
    sel === "rules" ? (
      // a short manifesto: big type, numbered, one rule a line
      <ol className="px-6 pb-6">
        {taste.rules.map((r, i) => (
          <li key={r} className={`flex items-baseline gap-4 py-[15px] ${i ? "shadow-[inset_0_0.5px_0_var(--separator-opaque)]" : ""}`}>
            <span className="w-5 shrink-0 text-[13px] font-semibold tabular-nums text-ink-3">{String(i + 1).padStart(2, "0")}</span>
            <span className="t-title3 text-ink [text-wrap:balance]">{r}</span>
          </li>
        ))}
      </ol>
    ) : (
      <div className="px-5 pb-6 pt-1">
        <List mac>
          {taste.rated.map((d) => (
            <ListRow
              mac
              key={d}
              icon={
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-[#B4B9C4] to-[#868B96] text-[12px] font-semibold text-white">{d[0].toUpperCase()}</span>
              }
              title={d}
            />
          ))}
        </List>
      </div>
    );
  return (
    <SplitView
      selected={sel}
      onSelect={setSel}
      sections={[
        {
          title: "Taste",
          items: [
            { id: "rules", label: "Rules", icon: <ListOrdered size={15} />, meta: <span className="text-[11px] tabular-nums text-ink-2">{taste.rules.length}</span> },
            { id: "rated", label: "Designers I rate", icon: <Star size={15} />, meta: <span className="text-[11px] tabular-nums text-ink-2">{taste.rated.length}</span> },
          ],
        },
      ]}
      detail={
        <div className="flex min-h-full flex-col">
          <Toolbar title={title} />
          <div className="flex flex-1 flex-col">{detail}</div>
        </div>
      }
    />
  );
}

export function Kit() {
  const [on, setOn] = useState(true);
  const [seg, setSeg] = useState<"day" | "week" | "month">("week");
  const [val, setVal] = useState(40);
  return (
    <div className="flex h-full min-h-0 flex-col bg-[#F7F7F9]">
      <Toolbar title="Kit" sub="Live components" />
      <div className="min-h-0 flex-1 space-y-5 overflow-auto p-5">
        <Group title="Controls">
          <Row label="Switch">
            <Switch on={on} onChange={setOn} label="Example switch" />
          </Row>
          <Row label="Segmented">
            <Segmented
              id="kit"
              value={seg}
              onChange={setSeg}
              options={[
                { value: "day", label: "Day" },
                { value: "week", label: "Week" },
                { value: "month", label: "Month" },
              ]}
            />
          </Row>
          <Row label="Slider" sub={`${val}%`}>
            <input id="kit-slider" type="range" aria-label="Example slider" min={0} max={100} value={val} onChange={(e) => setVal(+e.target.value)} className="scrub scrub-accent w-36" style={{ ["--p" as string]: `${val}%` }} />
          </Row>
        </Group>
        <Group title="Buttons">
          <Row label="Secondary and primary">
            <div className="flex gap-2">
              <Button size="sm">Cancel</Button>
              <Button size="sm" variant="primary">
                Save
              </Button>
            </div>
          </Row>
        </Group>
      </div>
    </div>
  );
}

// ---------- Founder and Lab: one app per endeavour ----------
