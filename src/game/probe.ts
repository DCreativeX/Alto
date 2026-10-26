import { setKeys, setSteer } from "@/game/input";

export const live = {
  yaw: 0,
  roll: 0,
  speed: 0,
};

export type ControlsProbe = {
  getYaw: () => number;
  getSpeed: () => number;
  getRoll: () => number;
  setKeys: (codes: string[]) => void;
  setSteer: (v: number) => void;
};

declare global {
  interface Window {
    __controlsTest?: ControlsProbe;
  }
}

const CARDINALS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

export function headingFromYaw(yaw: number): number {
  const deg = (-yaw * 180) / Math.PI;
  return ((deg % 360) + 360) % 360;
}

export function cardinalOf(deg: number): string {
  const i = Math.round(deg / 45) % 8;
  return CARDINALS[(i + 8) % 8] ?? "N";
}

if (typeof window !== "undefined") {
  window.__controlsTest = {
    getYaw: () => live.yaw,
    getSpeed: () => live.speed,
    getRoll: () => live.roll,
    setKeys,
    setSteer,
  };
}
