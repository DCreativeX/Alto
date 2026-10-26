import { useEffect, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { beginDrag, endDrag } from "@/game/input";
import { Hud } from "@/game/Hud";
import "@/game/probe";
import { useFlight } from "@/game/store";

export const Route = createFileRoute("/")({
  ssr: false,
  component: Home,
});

function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let stop = () => {};
    let cancelled = false;
    void import("@/game/FlightCanvas").then((mod) => {
      if (cancelled) return;
      stop = mod.startFlight(canvas);
    });
    return () => {
      cancelled = true;
      stop();
    };
  }, []);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-sky text-fg">
      <h1 className="sr-only">Alto ridge flight</h1>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block h-full w-full touch-none"
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          const store = useFlight.getState();
          const canvas = canvasRef.current;
          if (store.flying && !store.paused && canvas && window.matchMedia("(pointer: fine)").matches) {
            if (document.pointerLockElement !== canvas) {
              const lock = canvas.requestPointerLock();
              void Promise.resolve(lock).catch(() => {});
            }
          }
          beginDrag(e.clientX, e.clientY);
        }}
        onPointerUp={() => endDrag()}
        onPointerLeave={() => endDrag()}
      />
      <Hud />
    </main>
  );
}
