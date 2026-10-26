import { BufferGeometry, Color, Float32BufferAttribute, Vector3 } from "three";

export const WORLD = 520;
export const SEG = 64;
export const WATER = 8.2;

const N = SEG + 1;

function hash(ix: number, iz: number): number {
  let n = Math.imul(ix, 374761393) + Math.imul(iz, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  n = n ^ (n >>> 16);
  return (n >>> 0) / 4294967295;
}

function smooth(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

function valueNoise(x: number, z: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = x - x0;
  const fz = z - z0;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash(x0, z0);
  const b = hash(x0 + 1, z0);
  const c = hash(x0, z0 + 1);
  const d = hash(x0 + 1, z0 + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

function fbm(x: number, z: number): number {
  let v = 0;
  let a = 0.5;
  let f = 1;
  let sum = 0;
  for (let i = 0; i < 5; i++) {
    v += a * valueNoise(x * f, z * f);
    sum += a;
    f *= 2.02;
    a *= 0.5;
  }
  return v / sum;
}

function rawHeight(x: number, z: number): number {
  const nx = x / WORLD;
  const nz = z / WORLD;
  const d1 = Math.hypot(nx + 0.04, nz * 1.08);
  const d2 = Math.hypot((nx - 0.26) * 1.35, nz + 0.2);
  const land = smooth(1.02 - d1 * 2.2) * 0.9 + smooth(0.7 - d2 * 2.55) * 0.62;
  if (land <= 0.002) return 0.2;

  const warpX = fbm(nx * 1.6 + 2.2, nz * 1.6) - 0.5;
  const warpZ = fbm(nx * 1.6, nz * 1.6 + 5.4) - 0.5;
  const px = nx * 3.1 + warpX * 0.9;
  const pz = nz * 3.1 + warpZ * 0.9;
  const base = fbm(px, pz);
  const ridgeN = fbm(px * 1.7 + 8, pz * 1.7);
  const ridge = Math.pow(1 - Math.abs(ridgeN * 2 - 1), 1.5);
  const detail = fbm(px * 3.3 + 1.1, pz * 3.3);
  let h = (base * 16 + ridge * 28 + detail * 4.5) * land;
  const mass = Math.max(0, 1 - Math.hypot(nx + 0.06, nz - 0.04) / 0.2);
  h += mass * mass * 18;
  return h;
}

let grid: Float32Array | null = null;

export function getGrid(): Float32Array {
  if (grid) return grid;
  const g = new Float32Array(N * N);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = (i / SEG - 0.5) * WORLD;
      const z = (j / SEG - 0.5) * WORLD;
      g[j * N + i] = rawHeight(x, z);
    }
  }
  grid = g;
  return g;
}

export function sampleTerrain(x: number, z: number): number {
  const u = (x / WORLD + 0.5) * SEG;
  const v = (z / WORLD + 0.5) * SEG;
  if (u <= 0 || v <= 0 || u >= SEG || v >= SEG) return 0.2;
  const g = getGrid();
  const i = Math.min(SEG - 1, Math.floor(u));
  const j = Math.min(SEG - 1, Math.floor(v));
  const tx = u - i;
  const tz = v - j;
  const h00 = g[j * N + i]!;
  const h10 = g[j * N + i + 1]!;
  const h01 = g[(j + 1) * N + i]!;
  const h11 = g[(j + 1) * N + i + 1]!;
  return h00 + (h10 - h00) * tx + (h01 + (h11 - h01) * tx - (h00 + (h10 - h00) * tx)) * tz;
}

export function sampleSurface(x: number, z: number): number {
  return Math.max(sampleTerrain(x, z), WATER);
}

const STOPS: { h: number; hex: string }[] = [
  { h: 0, hex: "#14383e" },
  { h: 8.2, hex: "#d2be96" },
  { h: 10.4, hex: "#3e8c46" },
  { h: 16, hex: "#2a6838" },
  { h: 23, hex: "#5e6c49" },
  { h: 31, hex: "#8b7f74" },
  { h: 39, hex: "#d5dedb" },
  { h: 48, hex: "#f3f7f8" },
];

const stopColors = STOPS.map((s) => new Color(s.hex));
const tmpA = new Color();
const tmpB = new Color();

function colorFor(h: number, out: Color) {
  let i = 0;
  while (i < STOPS.length - 2 && h > STOPS[i + 1]!.h) i++;
  const a = STOPS[i]!;
  const b = STOPS[i + 1]!;
  const t = Math.min(1, Math.max(0, (h - a.h) / Math.max(0.001, b.h - a.h)));
  out.copy(tmpA.copy(stopColors[i]!).lerp(tmpB.copy(stopColors[i + 1]!), t));
}

export function buildTerrainGeometry(): BufferGeometry {
  const g = getGrid();
  const positions: number[] = [];
  const colors: number[] = [];
  const col = new Color();
  const face = new Color();

  const vert = (i: number, j: number) => {
    const x = (i / SEG - 0.5) * WORLD;
    const z = (j / SEG - 0.5) * WORLD;
    const y = g[j * N + i]!;
    return [x, y, z] as const;
  };

  const push = (i: number, j: number, hexHint: number) => {
    const [x, y, z] = vert(i, j);
    positions.push(x, y, z);
    colorFor(hexHint, col);
    colors.push(col.r, col.g, col.b);
  };

  for (let j = 0; j < SEG; j++) {
    for (let i = 0; i < SEG; i++) {
      const h =
        (g[j * N + i]! + g[j * N + i + 1]! + g[(j + 1) * N + i + 1]! + g[(j + 1) * N + i]!) / 4;
      face.copy(col);
      colorFor(h, face);
      const hint = h;
      push(i, j, hint);
      push(i + 1, j, hint);
      push(i + 1, j + 1, hint);
      push(i, j, hint);
      push(i + 1, j + 1, hint);
      push(i, j + 1, hint);
    }
  }

  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geo.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

export type Scatter = { x: number; y: number; z: number; s: number; r: number };

function slopeAt(x: number, z: number): number {
  return (
    Math.abs(sampleTerrain(x + 4, z) - sampleTerrain(x - 4, z)) +
    Math.abs(sampleTerrain(x, z + 4) - sampleTerrain(x, z - 4))
  );
}

export function scatterPines(): Scatter[] {
  const out: Scatter[] = [];
  for (let i = 0; i < 1100 && out.length < 380; i++) {
    const x = (hash(i * 3 + 1, 9) - 0.5) * WORLD * 0.9;
    const z = (hash(i * 3 + 2, 4) - 0.5) * WORLD * 0.9;
    const h = sampleTerrain(x, z);
    if (h < WATER + 1.6 || h > 27) continue;
    if (slopeAt(x, z) > 3.1) continue;
    out.push({
      x,
      y: h,
      z,
      s: 0.75 + hash(i, 11) * 1.45,
      r: hash(i, 12) * Math.PI * 2,
    });
  }
  return out;
}

export function scatterRocks(): Scatter[] {
  const out: Scatter[] = [];
  for (let i = 0; i < 500 && out.length < 70; i++) {
    const x = (hash(i + 40, 3) - 0.5) * WORLD * 0.86;
    const z = (hash(i + 41, 8) - 0.5) * WORLD * 0.86;
    const h = sampleTerrain(x, z);
    if (h < WATER + 4 || h > 42) continue;
    const slope = slopeAt(x, z);
    if (slope < 2.4) continue;
    out.push({
      x,
      y: h,
      z,
      s: 0.7 + hash(i, 19) * 1.8,
      r: hash(i, 21) * Math.PI,
    });
  }
  return out;
}

export function scatterBeacons(): Scatter[] {
  const out: Scatter[] = [];
  for (let i = 0; i < 400 && out.length < 8; i++) {
    const x = (hash(i + 80, 2) - 0.5) * WORLD * 0.78;
    const z = (hash(i + 81, 6) - 0.5) * WORLD * 0.78;
    const h = sampleTerrain(x, z);
    if (h < WATER + 2 || h > 16) continue;
    if (slopeAt(x, z) > 2.4) continue;
    if (out.some((b) => Math.hypot(b.x - x, b.z - z) < 46)) continue;
    out.push({ x, y: h, z, s: 1, r: 0 });
  }
  return out;
}

export function findPad(): { x: number; y: number; z: number } {
  let best = { x: 0, y: sampleSurface(0, 36), z: 36, score: -Infinity };
  for (let i = 0; i < 160; i++) {
    const a = hash(i + 300, 1) * Math.PI * 2;
    const r = 28 + hash(i + 301, 2) * 130;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const h = sampleTerrain(x, z);
    if (h < WATER + 3.2 || h > 18) continue;
    const slope = slopeAt(x, z);
    if (slope > 1.8) continue;
    const score = 6 - slope * 3 - Math.abs(h - 12) * 0.12;
    if (score > best.score) best = { x, y: h, z, score };
  }
  return { x: best.x, y: sampleTerrain(best.x, best.z), z: best.z };
}

export function sampleNormal(x: number, z: number, out: Vector3): Vector3 {
  const e = 4;
  const hL = sampleSurface(x - e, z);
  const hR = sampleSurface(x + e, z);
  const hD = sampleSurface(x, z - e);
  const hU = sampleSurface(x, z + e);
  return out.set(hL - hR, e * 2, hD - hU).normalize();
}
