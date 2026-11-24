"use client";

import { useEffect, useState } from "react";
import { useLiveInterval } from "./ui";

const fmt = (d: Date, withDay: boolean) =>
  d.toLocaleString("en-GB", {
    ...(withDay ? { weekday: "short", day: "numeric", month: "short" } : {}),
    hour: "2-digit",
    minute: "2-digit",
  }).replace(",", "");

export function useClock(withDay = true) {
  const [t, setT] = useState("");
  // ticks only while it can be seen (useLiveInterval), and at once when it can again
  useLiveInterval(() => setT(fmt(new Date(), withDay)), 15000, true);
  return t;
}

export function useDate() {
  const [t, setT] = useState("");
  useEffect(() => {
    setT(new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }));
  }, []);
  return t;
}
