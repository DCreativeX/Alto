const held = new Set<string>();
const virtual = new Set<string>();
const pointers = new Map<number, string>();
let steerOverride: number | null = null;

const LOOK = { x: 0, y: 0 };

export function setKeys(codes: string[]) {
  held.clear();
  for (const code of codes) held.add(code);
}

export function setSteer(v: number) {
  steerOverride = Math.max(-1, Math.min(1, v));
}

export function isDown(code: string): boolean {
  return held.has(code) || virtual.has(code);
}

export function readSteer(): number {
  if (steerOverride !== null) return steerOverride;
  let s = 0;
  if (isDown("KeyA") || isDown("ArrowLeft")) s += 1;
  if (isDown("KeyD") || isDown("ArrowRight")) s -= 1;
  return Math.max(-1, Math.min(1, s));
}

export function readThrust(): number {
  let t = 0;
  if (isDown("KeyW") || isDown("ArrowUp")) t += 1;
  if (isDown("KeyS") || isDown("ArrowDown")) t -= 1;
  return t;
}

export function boosting(): boolean {
  return isDown("ShiftLeft") || isDown("ShiftRight");
}

export function lifting(): boolean {
  return isDown("Space");
}

export function addLook(dx: number, dy: number) {
  LOOK.x += dx;
  LOOK.y += dy;
}

export function consumeLook(): [number, number] {
  const out: [number, number] = [LOOK.x, LOOK.y];
  LOOK.x = 0;
  LOOK.y = 0;
  return out;
}

export function virtualDown(id: number, code: string) {
  pointers.set(id, code);
  virtual.add(code);
}

export function virtualUp(id: number) {
  const code = pointers.get(id);
  pointers.delete(id);
  if (!code) return;
  for (const other of pointers.values()) {
    if (other === code) return;
  }
  virtual.delete(code);
}

export function clearHeld() {
  held.clear();
  virtual.clear();
  pointers.clear();
}

let drag = false;
let lastX = 0;
let lastY = 0;
let installed = false;

export function installInput() {
  if (installed || typeof window === "undefined") return () => {};
  installed = true;

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    held.add(e.code);
    if (
      e.code === "Space" ||
      e.code.startsWith("Arrow") ||
      e.code === "KeyW" ||
      e.code === "KeyA" ||
      e.code === "KeyS" ||
      e.code === "KeyD"
    ) {
      e.preventDefault();
    }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    held.delete(e.code);
  };
  const onMove = (e: PointerEvent) => {
    if (document.pointerLockElement) {
      addLook(e.movementX, e.movementY);
      return;
    }
    if (!drag) return;
    addLook(e.clientX - lastX, e.clientY - lastY);
    lastX = e.clientX;
    lastY = e.clientY;
  };
  const onUp = () => {
    drag = false;
  };
  const onBlur = () => {
    held.clear();
    virtual.clear();
    pointers.clear();
    drag = false;
  };
  const onVis = () => {
    if (document.hidden) onBlur();
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
  window.addEventListener("blur", onBlur);
  document.addEventListener("visibilitychange", onVis);

  return () => {
    installed = false;
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
    window.removeEventListener("blur", onBlur);
    document.removeEventListener("visibilitychange", onVis);
  };
}

export function beginDrag(clientX: number, clientY: number) {
  drag = true;
  lastX = clientX;
  lastY = clientY;
}

export function endDrag() {
  drag = false;
}
