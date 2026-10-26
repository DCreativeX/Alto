export function lockLook() {
  const canvas = document.querySelector("canvas");
  if (!canvas) return;
  if (!window.matchMedia("(pointer: fine)").matches) return;
  try {
    const lock = canvas.requestPointerLock();
    void Promise.resolve(lock).catch(() => {});
  } catch {
    /* pointer lock is optional */
  }
}
