import { create } from "zustand";
import { clearHeld } from "@/game/input";

const KEY = "alto-settings-v1";

type Saved = { night: boolean; wire: boolean; muted: boolean };

function loadSettings(): Saved {
  const fallback = { night: false, wire: false, muted: false };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<Saved> & { version?: number };
    return {
      night: !!parsed.night,
      wire: !!parsed.wire,
      muted: !!parsed.muted,
    };
  } catch {
    return fallback;
  }
}

function persist(s: Saved) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: 1, ...s }));
  } catch {
    /* ignore quota */
  }
}

type Telemetry = {
  speed: number;
  agl: number;
  asl: number;
  heading: number;
  scraping: boolean;
};

type FlightState = Saved &
  Telemetry & {
    flying: boolean;
    paused: boolean;
    session: number;
    locked: boolean;
    ready: boolean;
    start: () => void;
    pause: () => void;
    resume: () => void;
    restart: () => void;
    menu: () => void;
    toggleNight: () => void;
    toggleWire: () => void;
    toggleMute: () => void;
    setLocked: (v: boolean) => void;
    setReady: (v: boolean) => void;
    setTelemetry: (t: Telemetry) => void;
  };

export const useFlight = create<FlightState>((set, get) => ({
  ...loadSettings(),
  flying: false,
  paused: false,
  session: 0,
  locked: false,
  ready: false,
  speed: 0,
  agl: 0,
  asl: 0,
  heading: 0,
  scraping: false,
  start: () => set((s) => ({ flying: true, paused: false, session: s.session + 1 })),
  pause: () => {
    clearHeld();
    if (typeof document !== "undefined" && document.pointerLockElement) document.exitPointerLock();
    set({ paused: true, locked: false });
  },
  resume: () => set({ paused: false }),
  restart: () => {
    clearHeld();
    set((s) => ({ flying: true, paused: false, session: s.session + 1 }));
  },
  menu: () => {
    clearHeld();
    if (typeof document !== "undefined" && document.pointerLockElement) document.exitPointerLock();
    set({ flying: false, paused: false, locked: false });
  },
  toggleNight: () => {
    const night = !get().night;
    set({ night });
    persist({ night, wire: get().wire, muted: get().muted });
  },
  toggleWire: () => {
    const wire = !get().wire;
    set({ wire });
    persist({ night: get().night, wire, muted: get().muted });
  },
  toggleMute: () => {
    const muted = !get().muted;
    set({ muted });
    persist({ night: get().night, wire: get().wire, muted });
  },
  setLocked: (locked) => set({ locked }),
  setReady: (ready) => set({ ready }),
  setTelemetry: (t) => set(t),
}));
