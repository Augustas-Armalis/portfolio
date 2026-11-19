"use client";

import { useEffect, useState } from "react";

const fmt = (d: Date, withDay: boolean) =>
  d.toLocaleString("en-GB", {
    ...(withDay ? { weekday: "short", day: "numeric", month: "short" } : {}),
    hour: "2-digit",
    minute: "2-digit",
  }).replace(",", "");

export function useClock(withDay = true) {
  const [t, setT] = useState("");
  useEffect(() => {
    const tick = () => setT(fmt(new Date(), withDay));
    tick();
    const iv = window.setInterval(tick, 15000);
    return () => window.clearInterval(iv);
  }, [withDay]);
  return t;
}

export function useDate() {
  const [t, setT] = useState("");
  useEffect(() => {
    setT(new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }));
  }, []);
  return t;
}
