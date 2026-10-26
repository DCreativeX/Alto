import {
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  Euler,
  Float32BufferAttribute,
  Fog,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  InstancedMesh,
  MathUtils,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  NoToneMapping,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Quaternion,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import { ensureAudio, updateAudio } from "@/game/audio";
import { boosting, consumeLook, installInput, lifting, readSteer, readThrust } from "@/game/input";
import { headingFromYaw, live } from "@/game/probe";
import { useFlight } from "@/game/store";
import {
  WATER,
  WORLD,
  buildTerrainGeometry,
  findPad,
  sampleNormal,
  sampleSurface,
  scatterBeacons,
  scatterPines,
  scatterRocks,
  type Scatter,
} from "@/game/terrain";

const SKY_DAY = "#c5dceb";
const SKY_NIGHT = "#121a30";
const SUN = "#ffe3a4";
const MOON = "#d5def8";
const PINE = "#245c34";
const PINE_DARK = "#163f24";
const ROCK = "#8a8076";
const CLOUD = "#f7f4ee";
const CLOUD_NIGHT = "#8e9bb8";
const CREAM = "#efe8d8";
const AMBER = "#e2a84a";
const CANOPY = "#1c3330";
const PROP = "#2a241c";

const reducedMotion =
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const _fwd = new Vector3();
const _up = new Vector3();
const _right = new Vector3();
const _x = new Vector3();
const _cam = new Vector3();
const _look = new Vector3();
const _n = new Vector3();
const _m = new Matrix4();
const _bg = new Color();
const _day = new Color(SKY_DAY);
const _night = new Color(SKY_NIGHT);
const _warm = new Color("#fff1d4");
const _cool = new Color("#9eb0e8");
const _groundD = new Color("#6d8f62");
const _groundN = new Color("#1a2822");
const _camUp = new Vector3();
const _cloudM = new Matrix4();
const _cloudP = new Vector3();
const _cloudQ = new Quaternion();
const _cloudS = new Vector3();
const _cloudD = new Color(CLOUD);
const _cloudN = new Color(CLOUD_NIGHT);
const _waterDay = new Color("#14727a");
const _waterNight = new Color("#0c2430");

const CLEARANCE = 1.75;
const TURN = 1.25;
const MOUSE = 0.0026;

type Sim = {
  yaw: number;
  pitch: number;
  roll: number;
  pos: Vector3;
  vel: Vector3;
  pad: { x: number; y: number; z: number };
  padReady: boolean;
  session: number;
  attract: number;
  night: number;
  acc: number;
  hud: number;
  scraping: boolean;
  camReady: boolean;
  speed: number;
};

type World = {
  fog: Fog;
  craft: Group;
  prop: Group;
  shadow: Mesh;
  shadowMat: MeshBasicMaterial;
  sun: Mesh;
  sunMat: MeshBasicMaterial;
  moon: Mesh;
  moonMat: MeshBasicMaterial;
  stars: Points;
  starMat: PointsMaterial;
  hemi: HemisphereLight;
  dir: DirectionalLight;
  amb: AmbientLight;
  terrainMat: MeshLambertMaterial;
  water: BufferGeometry;
  waterBase: Float32Array;
  waterMat: MeshBasicMaterial;
  clouds: InstancedMesh;
  cloudMat: MeshBasicMaterial;
  puffs: { x: number; y: number; z: number; s: number }[];
};

function makeSim(): Sim {
  return {
    yaw: 0.4,
    pitch: 0,
    roll: 0,
    pos: new Vector3(),
    vel: new Vector3(),
    pad: { x: 0, y: 12, z: 36 },
    padReady: false,
    session: 0,
    attract: 0.7,
    night: 0,
    acc: 0,
    hud: 0,
    scraping: false,
    camReady: false,
    speed: 0,
  };
}

// A / ArrowLeft → steer +1 → +yaw (nose left from the chase cam) and +roll (left wing down).
// Mouse right → −yaw (nose right). Mouse up → +pitch (nose up).
function orient(yaw: number, pitch: number, roll: number) {
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const sy = Math.sin(yaw);
  const cy = Math.cos(yaw);
  _fwd.set(-sy * cp, sp, -cy * cp);
  _right.crossVectors(_fwd, Object3D.DEFAULT_UP);
  if (_right.lengthSq() < 1e-8) _right.set(cy, 0, -sy);
  else _right.normalize();
  _up.crossVectors(_right, _fwd).normalize();
  if (roll !== 0) {
    const cr = Math.cos(roll);
    const sr = Math.sin(roll);
    const rx = _right.x * cr - _up.x * sr;
    const ry = _right.y * cr - _up.y * sr;
    const rz = _right.z * cr - _up.z * sr;
    const ux = _up.x * cr + _right.x * sr;
    const uy = _up.y * cr + _right.y * sr;
    const uz = _up.z * cr + _right.z * sr;
    _right.set(rx, ry, rz);
    _up.set(ux, uy, uz);
  }
}

function applyBasis(obj: Object3D) {
  _x.crossVectors(_up, _fwd).normalize();
  _m.makeBasis(_x, _up, _fwd);
  obj.quaternion.setFromRotationMatrix(_m);
}

function step(sim: Sim, dt: number) {
  const steer = readSteer();
  const thrust = readThrust();
  const boost = boosting();
  const lift = lifting();
  sim.yaw += steer * TURN * dt;
  const targetRoll = steer * 0.72;
  sim.roll += (targetRoll - sim.roll) * (1 - Math.exp(-7 * dt));
  orient(sim.yaw, sim.pitch, sim.roll);

  if (thrust > 0) sim.vel.addScaledVector(_fwd, (boost ? 78 : 46) * dt);
  else if (thrust < 0) sim.vel.addScaledVector(_fwd, -30 * dt);
  if (lift) sim.vel.y += 24 * dt;

  const drag = thrust === 0 ? 0.72 : 0.48;
  sim.vel.multiplyScalar(Math.exp(-drag * dt));
  const max = boost && thrust > 0 ? 96 : 66;
  const sp = sim.vel.length();
  if (sp > max) sim.vel.multiplyScalar(max / sp);

  const dist = sim.vel.length() * dt;
  const n = Math.min(4, Math.max(1, Math.ceil(dist / 2.5)));
  const h = dt / n;
  let scraping = false;
  for (let i = 0; i < n; i++) {
    sim.pos.addScaledVector(sim.vel, h);
    const ground = sampleSurface(sim.pos.x, sim.pos.z) + CLEARANCE;
    if (sim.pos.y < ground) {
      sim.pos.y = ground;
      sampleNormal(sim.pos.x, sim.pos.z, _n);
      const vn = sim.vel.dot(_n);
      if (vn < 0) sim.vel.addScaledVector(_n, -vn);
      sim.vel.multiplyScalar(Math.exp(-1.1 * h));
      scraping = true;
    }
  }

  const limit = WORLD * 0.47;
  const radial = Math.hypot(sim.pos.x, sim.pos.z);
  if (radial > limit) {
    sim.vel.x -= (sim.pos.x / radial) * 22 * dt;
    sim.vel.z -= (sim.pos.z / radial) * 22 * dt;
  }

  sim.scraping = scraping;
  sim.speed = sim.vel.length();
}

function chaseDesired(sim: Sim, target: Vector3) {
  orient(sim.yaw, sim.pitch, sim.roll);
  let dist = 14.5;
  for (let i = 0; i < 5; i++) {
    target.copy(sim.pos).addScaledVector(_fwd, -dist);
    target.y += 4.2;
    if (target.y >= sampleSurface(target.x, target.z) + 1.5) break;
    dist *= 0.62;
  }
}

function scatterInstances(mesh: InstancedMesh, markers: Scatter[], height: number) {
  const m = new Matrix4();
  const q = new Quaternion();
  const p = new Vector3();
  const s = new Vector3();
  const up = new Vector3(0, 1, 0);
  markers.forEach((t, i) => {
    const sy = t.s;
    p.set(t.x, t.y + (height * sy) / 2, t.z);
    q.setFromAxisAngle(up, t.r);
    s.set(t.s, sy, t.s);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
  });
  mesh.count = markers.length;
  mesh.instanceMatrix.needsUpdate = true;
}

function makePines(markers: Scatter[], color: string, height: number, radius: number) {
  const mesh = new InstancedMesh(
    new ConeGeometry(radius, height, 5),
    new MeshLambertMaterial({ color, flatShading: true }),
    Math.max(1, markers.length),
  );
  mesh.frustumCulled = false;
  if (markers.length === 0) mesh.count = 0;
  else scatterInstances(mesh, markers, height);
  return mesh;
}

function makeRocks(markers: Scatter[]) {
  const mesh = new InstancedMesh(
    new IcosahedronGeometry(0.7, 0),
    new MeshLambertMaterial({ color: ROCK, flatShading: true }),
    Math.max(1, markers.length),
  );
  const m = new Matrix4();
  const q = new Quaternion();
  const e = new Euler();
  const p = new Vector3();
  const s = new Vector3();
  markers.forEach((t, i) => {
    p.set(t.x, t.y + t.s * 0.15, t.z);
    e.set(t.r, t.r * 1.3, t.r * 0.4);
    q.setFromEuler(e);
    s.set(t.s * 1.3, t.s * 0.8, t.s);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
  });
  mesh.count = markers.length;
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

function makeBeacons(markers: Scatter[]) {
  const group = new Group();
  for (const b of markers) {
    const pole = new Mesh(
      new CylinderGeometry(0.08, 0.12, 4.2, 5),
      new MeshLambertMaterial({ color: "#d7d0c4", flatShading: true }),
    );
    pole.position.set(b.x, b.y + 2.1, b.z);
    const lamp = new Mesh(new BoxGeometry(0.55, 0.38, 0.55), new MeshBasicMaterial({ color: AMBER }));
    lamp.position.set(b.x, b.y + 4.35, b.z);
    group.add(pole, lamp);
  }
  return group;
}

function makeClouds() {
  const puffs: { x: number; y: number; z: number; s: number }[] = [];
  for (let i = 0; i < 16; i++) {
    const cx = Math.sin(i * 1.7) * WORLD * 0.32 + (i % 3) * 18;
    const cz = Math.cos(i * 1.3) * WORLD * 0.3;
    const cy = 68 + (i % 5) * 6;
    for (let k = 0; k < 4; k++) {
      puffs.push({
        x: cx + Math.cos(k * 2.1 + i) * 6,
        y: cy + (k % 2) * 1.4,
        z: cz + Math.sin(k * 1.7 + i) * 5,
        s: 6 + (k % 3) * 2.2,
      });
    }
  }
  const cloudMat = new MeshBasicMaterial({ color: CLOUD, toneMapped: false });
  const clouds = new InstancedMesh(new IcosahedronGeometry(1, 0), cloudMat, puffs.length);
  clouds.frustumCulled = false;
  return { clouds, cloudMat, puffs };
}

function makeCraft() {
  const craft = new Group();
  const body = new Group();
  const paint = new MeshLambertMaterial({ color: CREAM, flatShading: true });
  const belly = new MeshLambertMaterial({ color: "#2f5c3c", flatShading: true });
  const metal = new MeshLambertMaterial({ color: "#b7b1a4", flatShading: true });
  const dark = new MeshLambertMaterial({ color: PROP, flatShading: true });
  const glass = new MeshLambertMaterial({ color: CANOPY, flatShading: true });
  const trim = new MeshLambertMaterial({ color: AMBER, flatShading: true });
  const rubber = new MeshLambertMaterial({ color: "#161412", flatShading: true });
  const red = new MeshBasicMaterial({ color: "#d4543c" });
  const green = new MeshBasicMaterial({ color: "#3cba6a" });

  const put = (
    geo: Mesh["geometry"],
    mat: MeshBasicMaterial | MeshLambertMaterial,
    x: number,
    y: number,
    z: number,
    rx = 0,
    ry = 0,
    rz = 0,
  ) => {
    const mesh = new Mesh(geo, mat);
    mesh.position.set(x, y, z);
    if (rx || ry || rz) mesh.rotation.set(rx, ry, rz);
    body.add(mesh);
    return mesh;
  };

  put(new CylinderGeometry(0.36, 0.13, 1.75, 6), paint, 0, 0.16, -1.45, Math.PI / 2);
  put(new BoxGeometry(0.92, 0.88, 1.58), paint, 0, 0.2, 0.1);
  put(new BoxGeometry(0.74, 0.18, 1.35), belly, 0, -0.24, 0.04);
  put(new CylinderGeometry(0.33, 0.36, 1.15, 8), metal, 0, 0.05, 1.28, Math.PI / 2);
  put(new CylinderGeometry(0.34, 0.34, 0.09, 8), dark, 0, 0.05, 1.84, Math.PI / 2);
  put(new ConeGeometry(0.14, 0.4, 8), metal, 0, 0.05, 2.08, Math.PI / 2);
  put(new BoxGeometry(0.92, 0.06, 0.22), dark, 0, 0.22, 0.95);

  put(new BoxGeometry(0.05, 0.07, 2.55), trim, 0.47, 0.0, 0.05);
  put(new BoxGeometry(0.05, 0.07, 2.55), trim, -0.47, 0.0, 0.05);

  put(new BoxGeometry(0.74, 0.5, 0.06), glass, 0, 0.42, 0.86, -0.58);
  put(new BoxGeometry(0.68, 0.045, 0.78), glass, 0, 0.65, 0.18);
  put(new BoxGeometry(0.04, 0.36, 0.82), glass, 0.47, 0.3, 0.14);
  put(new BoxGeometry(0.04, 0.36, 0.82), glass, -0.47, 0.3, 0.14);

  put(new BoxGeometry(1.2, 0.08, 1.05), paint, 0, 0.7, 0.16);
  for (const side of [1, -1] as const) {
    const wing = new Group();
    wing.position.set(side * 0.55, 0.7, 0.16);
    wing.rotation.z = side * 0.08;
    const panel = new Mesh(new BoxGeometry(3.15, 0.1, 1.2), paint);
    panel.position.set(side * 1.58, 0.02, 0);
    wing.add(panel);
    const under = new Mesh(new BoxGeometry(3.05, 0.045, 1.05), belly);
    under.position.set(side * 1.58, -0.04, 0);
    wing.add(under);
    const flap = new Mesh(new BoxGeometry(1.45, 0.04, 0.18), metal);
    flap.position.set(side * 1.85, -0.02, -0.42);
    wing.add(flap);
    const tip = new Mesh(new BoxGeometry(0.14, 0.1, 1.05), trim);
    tip.position.x = side * 3.18;
    wing.add(tip);
    const light = new Mesh(new BoxGeometry(0.1, 0.07, 0.1), side < 0 ? red : green);
    light.position.set(side * 3.18, 0.02, 0.42);
    wing.add(light);
    body.add(wing);
    put(new BoxGeometry(0.045, 0.95, 0.045), dark, side * 1.15, 0.22, 0.02, 0, 0, -side * 0.18);
  }

  put(new BoxGeometry(2.25, 0.05, 0.5), paint, 0, 0.26, -2.08);
  put(new BoxGeometry(0.72, 0.035, 0.16), trim, 0.72, 0.28, -2.28);
  put(new BoxGeometry(0.72, 0.035, 0.16), trim, -0.72, 0.28, -2.28);
  put(new BoxGeometry(0.065, 1.08, 0.78), paint, 0, 0.78, -1.98, -0.2);
  put(new BoxGeometry(0.05, 0.78, 0.16), trim, 0, 0.84, -2.32);

  for (const side of [1, -1] as const) {
    put(new BoxGeometry(0.05, 0.58, 0.05), dark, side * 0.4, -0.5, -0.05);
    put(new CylinderGeometry(0.17, 0.17, 0.09, 10), rubber, side * 0.4, -0.8, -0.05, 0, 0, Math.PI / 2);
    put(new CylinderGeometry(0.07, 0.07, 0.11, 6), metal, side * 0.4, -0.8, -0.05, 0, 0, Math.PI / 2);
  }
  put(new BoxGeometry(0.045, 0.42, 0.045), dark, 0, -0.24, 1.32);
  put(new CylinderGeometry(0.13, 0.13, 0.08, 10), rubber, 0, -0.48, 1.32, 0, 0, Math.PI / 2);

  const prop = new Group();
  prop.position.set(0, 0.05, 1.9);
  const hub = new Mesh(new CylinderGeometry(0.07, 0.07, 0.07, 8), metal);
  hub.rotation.x = Math.PI / 2;
  prop.add(hub);
  for (const side of [1, -1] as const) {
    const blade = new Mesh(new BoxGeometry(0.1, 0.72, 0.03), dark);
    blade.position.y = 0.4 * side;
    blade.rotation.y = side * 0.6;
    prop.add(blade);
  }
  body.add(prop);

  body.scale.setScalar(1.35);
  craft.add(body);
  return { craft, prop };
}

function createScene() {
  const scene = new Scene();
  const fog = new Fog(SKY_DAY, 90, 420);
  scene.fog = fog;
  scene.background = new Color(SKY_DAY);

  const hemi = new HemisphereLight(SKY_DAY, "#6d8f62", 0.95);
  const amb = new AmbientLight("#ffffff", 0.34);
  const dir = new DirectionalLight(SUN, 2.35);
  dir.position.set(140, 190, 70);
  scene.add(hemi, amb, dir);

  const sunMat = new MeshBasicMaterial({ color: SUN, transparent: true, opacity: 1, toneMapped: false });
  const sun = new Mesh(new SphereGeometry(16, 12, 8), sunMat);
  const moonMat = new MeshBasicMaterial({ color: MOON, transparent: true, opacity: 0, toneMapped: false });
  const moon = new Mesh(new SphereGeometry(11, 10, 8), moonMat);
  const starPos = new Float32Array(280 * 3);
  for (let i = 0; i < 280; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 180 + Math.random() * 220;
    starPos[i * 3] = Math.cos(a) * r;
    starPos[i * 3 + 1] = 40 + Math.random() * 220;
    starPos[i * 3 + 2] = Math.sin(a) * r;
  }
  const starGeo = new BufferGeometry();
  starGeo.setAttribute("position", new Float32BufferAttribute(starPos, 3));
  const starMat = new PointsMaterial({
    color: "#e7efe4",
    size: 1.7,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const stars = new Points(starGeo, starMat);
  scene.add(sun, moon, stars);

  const terrainMat = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
  scene.add(new Mesh(buildTerrainGeometry(), terrainMat));

  const waterGeo = new PlaneGeometry(WORLD * 2.2, WORLD * 2.2, 36, 36);
  const waterBase = new Float32Array(waterGeo.attributes.position!.array as Float32Array);
  const waterMat = new MeshBasicMaterial({
    color: "#14727a",
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    toneMapped: false,
  });
  const waterMesh = new Mesh(waterGeo, waterMat);
  waterMesh.rotation.x = -Math.PI / 2;
  waterMesh.position.y = WATER + 0.2;
  scene.add(waterMesh);

  const pines = scatterPines();
  scene.add(makePines(pines, PINE, 2.5, 0.85));
  scene.add(
    makePines(
      pines.map((p) => ({ ...p, y: p.y + p.s * 1.15, s: p.s * 0.72 })),
      PINE_DARK,
      1.7,
      0.62,
    ),
  );
  scene.add(makeRocks(scatterRocks()));
  scene.add(makeBeacons(scatterBeacons()));

  const { clouds, cloudMat, puffs } = makeClouds();
  scene.add(clouds);

  const shadowMat = new MeshBasicMaterial({ color: "#101614", transparent: true, opacity: 0.22, depthWrite: false });
  const shadow = new Mesh(new CircleGeometry(2.6, 16), shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.visible = false;
  scene.add(shadow);

  const { craft, prop } = makeCraft();
  scene.add(craft);

  const world: World = {
    fog,
    craft,
    prop,
    shadow,
    shadowMat,
    sun,
    sunMat,
    moon,
    moonMat,
    stars,
    starMat,
    hemi,
    dir,
    amb,
    terrainMat,
    water: waterGeo,
    waterBase,
    waterMat,
    clouds,
    cloudMat,
    puffs,
  };
  return { scene, world };
}

function tick(world: World, sim: Sim, camera: PerspectiveCamera, dt: number, now: number) {
  if (!sim.padReady) {
    sim.pad = findPad();
    sim.padReady = true;
    sim.pos.set(sim.pad.x, sim.pad.y + 12, sim.pad.z);
  }

  const store = useFlight.getState();
  const targetNight = store.night ? 1 : 0;
  sim.night += (targetNight - sim.night) * (reducedMotion ? 1 : 1 - Math.exp(-3.5 * dt));

  _bg.copy(_day).lerp(_night, sim.night);
  const sceneBg = world.fog.color;
  sceneBg.copy(_bg);
  world.fog.near = MathUtils.lerp(90, 50, sim.night);
  world.fog.far = MathUtils.lerp(420, 300, sim.night);
  world.hemi.color.copy(_day).lerp(_night, sim.night * 0.65);
  world.hemi.groundColor.copy(_groundD).lerp(_groundN, sim.night);
  world.hemi.intensity = MathUtils.lerp(0.95, 0.42, sim.night);
  world.amb.intensity = MathUtils.lerp(0.34, 0.2, sim.night);
  world.dir.intensity = MathUtils.lerp(2.35, 0.38, sim.night);
  world.dir.color.copy(_warm).lerp(_cool, sim.night);
  world.dir.position.set(
    MathUtils.lerp(140, -100, sim.night),
    MathUtils.lerp(190, 80, sim.night),
    MathUtils.lerp(70, -40, sim.night),
  );
  world.sun.position.set(230, 150, 70);
  world.sunMat.opacity = 1 - sim.night;
  world.moon.position.set(-210, 130, -50);
  world.moonMat.opacity = sim.night;
  world.starMat.opacity = sim.night;
  world.stars.visible = sim.night > 0.04;
  world.terrainMat.wireframe = store.wire;

  const arr = world.water.attributes.position!.array as Float32Array;
  const src = world.waterBase;
  const waveT = reducedMotion ? 0 : now * 0.001;
  for (let i = 0; i < arr.length; i += 3) {
    const x = src[i]!;
    const y = src[i + 1]!;
    arr[i + 2] = Math.sin(x * 0.07 + waveT * 1.1) * 0.35 + Math.cos(y * 0.05 - waveT * 0.8) * 0.25;
  }
  world.water.attributes.position!.needsUpdate = true;
  world.waterMat.color.copy(_waterDay).lerp(_waterNight, sim.night);

  const drift = reducedMotion ? 0 : Math.sin(now * 0.00008) * 18;
  for (let i = 0; i < world.puffs.length; i++) {
    const c = world.puffs[i]!;
    _cloudP.set(c.x + drift, c.y, c.z);
    _cloudS.set(c.s, c.s * 0.55, c.s);
    _cloudM.compose(_cloudP, _cloudQ, _cloudS);
    world.clouds.setMatrixAt(i, _cloudM);
  }
  world.clouds.instanceMatrix.needsUpdate = true;
  world.cloudMat.color.copy(_cloudD).lerp(_cloudN, sim.night);

  const [dx, dy] = consumeLook();
  const flying = store.flying;
  const paused = store.paused;
  world.prop.rotation.z += dt * (8 + live.speed * 0.7);

  if (!flying) {
    if (!reducedMotion) sim.attract += dt * 0.15;
    sim.yaw = sim.attract;
    sim.pitch = 0;
    sim.roll = 0;
    orient(sim.yaw, 0, 0);
    sim.pos.set(sim.pad.x, sim.pad.y + 1.15, sim.pad.z);
    world.craft.position.copy(sim.pos);
    applyBasis(world.craft);
    const a = sim.attract;
    _cam.set(
      sim.pad.x + Math.sin(a) * 16 + Math.cos(a) * 7,
      sim.pad.y + 4.6,
      sim.pad.z + Math.cos(a) * 16 - Math.sin(a) * 7,
    );
    const gy = sampleSurface(_cam.x, _cam.z) + 2;
    if (_cam.y < gy) _cam.y = gy;
    if (!sim.camReady) {
      camera.position.copy(_cam);
      sim.camReady = true;
    } else camera.position.lerp(_cam, 1 - Math.exp(-2.4 * dt));
    camera.up.set(0, 1, 0);
    camera.lookAt(sim.pad.x, sim.pad.y + 1.5, sim.pad.z);
    live.yaw = sim.yaw;
    live.roll = 0;
    live.speed = 0;
    world.shadow.visible = false;
    updateAudio(0, 0, store.muted, false);
    return;
  }

  if (sim.session !== store.session) {
    sim.session = store.session;
    sim.yaw = sim.attract;
    sim.pitch = 0.08;
    sim.roll = 0;
    sim.pos.set(sim.pad.x, sim.pad.y + 14, sim.pad.z);
    sim.vel.set(0, 0, 0);
    sim.speed = 0;
    sim.scraping = false;
    ensureAudio();
  }

  if (!paused) {
    sim.yaw -= dx * MOUSE;
    sim.pitch = MathUtils.clamp(sim.pitch - dy * MOUSE, -1.02, 1.02);
    sim.acc += dt;
    if (sim.acc > 0.12) sim.acc = 0.12;
    let guard = 0;
    while (sim.acc >= 1 / 60 && guard++ < 6) {
      step(sim, 1 / 60);
      sim.acc -= 1 / 60;
    }
  }

  orient(sim.yaw, sim.pitch, sim.roll);
  world.craft.position.copy(sim.pos);
  applyBasis(world.craft);

  const groundY = sampleSurface(sim.pos.x, sim.pos.z) + 0.25;
  const aglShadow = Math.max(0, sim.pos.y - groundY);
  world.shadow.visible = aglShadow < 28;
  world.shadow.position.set(sim.pos.x, groundY, sim.pos.z);
  const sc = MathUtils.clamp(1.4 + aglShadow * 0.04, 1.2, 3.2);
  world.shadow.scale.set(sc, sc, sc);
  world.shadowMat.opacity = MathUtils.clamp(0.28 - aglShadow * 0.01, 0.05, 0.28);

  chaseDesired(sim, _cam);
  const k = 1 - Math.exp(-7 * dt);
  if (!sim.camReady) {
    camera.position.copy(_cam);
    sim.camReady = true;
  } else camera.position.lerp(_cam, paused ? 1 : k);
  const camFloor = sampleSurface(camera.position.x, camera.position.z) + 1.4;
  if (camera.position.y < camFloor) camera.position.y = camFloor;
  _look.copy(sim.pos).addScaledVector(_fwd, 9);
  _look.y += 0.5;
  camera.up.copy(_camUp.copy(_up).lerp(Object3D.DEFAULT_UP, 0.55).normalize());
  camera.lookAt(_look);

  const fov = camera.aspect < 0.9 ? 72 : 58;
  if (Math.abs(camera.fov - fov) > 0.4) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }

  live.yaw = sim.yaw;
  live.roll = sim.roll;
  live.speed = sim.speed;
  updateAudio(sim.speed, paused ? 0 : readThrust(), store.muted, !paused);

  sim.hud += dt;
  if (sim.hud > 0.1) {
    sim.hud = 0;
    const agl = Math.max(0, sim.pos.y - sampleSurface(sim.pos.x, sim.pos.z) - 1.1);
    useFlight.getState().setTelemetry({
      speed: sim.speed,
      agl,
      asl: sim.pos.y,
      heading: headingFromYaw(sim.yaw),
      scraping: sim.scraping,
    });
  }
}

export function startFlight(canvas: HTMLCanvasElement) {
  const stopInput = installInput();
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NoToneMapping;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
  const camera = new PerspectiveCamera(58, 1, 0.15, 900);
  camera.position.set(40, 36, 78);
  const fit = () => {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  fit();
  const { scene, world } = createScene();
  scene.background = world.fog.color;

  const sim = makeSim();
  let frame = 0;
  let last = performance.now();
  const loop = (now: number) => {
    frame = requestAnimationFrame(loop);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    tick(world, sim, camera, dt, now);
    renderer.render(scene, camera);
  };
  frame = requestAnimationFrame(loop);
  useFlight.getState().setReady(true);

  const onLock = () => {
    useFlight.getState().setLocked(document.pointerLockElement === canvas);
  };
  const resize = new ResizeObserver(fit);
  resize.observe(canvas);
  document.addEventListener("pointerlockchange", onLock);
  window.addEventListener("resize", fit);

  return () => {
    cancelAnimationFrame(frame);
    stopInput();
    resize.disconnect();
    document.removeEventListener("pointerlockchange", onLock);
    window.removeEventListener("resize", fit);
    renderer.dispose();
    useFlight.getState().setReady(false);
  };
}

