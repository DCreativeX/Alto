import { useEffect, useState } from "react";
import { cardinalOf } from "@/game/probe";
import { ensureAudio } from "@/game/audio";
import { virtualDown, virtualUp } from "@/game/input";
import { lockLook } from "@/game/lock";
import { useFlight } from "@/game/store";

function useTouch() {
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const apply = () => setTouch(mq.matches || window.innerWidth < 860);
    apply();
    mq.addEventListener("change", apply);
    window.addEventListener("resize", apply);
    return () => {
      mq.removeEventListener("change", apply);
      window.removeEventListener("resize", apply);
    };
  }, []);
  return touch;
}

function Hold({ code, label }: { code: string; label: string }) {
  return (
    <button
      type="button"
      className="hold"
      tabIndex={-1}
      aria-label={label}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        e.currentTarget.dataset.hot = "true";
        virtualDown(e.pointerId, code);
      }}
      onPointerUp={(e) => {
        e.currentTarget.dataset.hot = "false";
        virtualUp(e.pointerId);
      }}
      onPointerCancel={(e) => {
        e.currentTarget.dataset.hot = "false";
        virtualUp(e.pointerId);
      }}
    >
      {label}
    </button>
  );
}

function Compact() {
  const speed = useFlight((s) => s.speed);
  const agl = useFlight((s) => s.agl);
  const heading = useFlight((s) => s.heading);
  const scraping = useFlight((s) => s.scraping);
  const spd = speed < 10 ? speed.toFixed(1) : String(Math.round(speed));
  const hdg = String(Math.round(heading)).padStart(3, "0");
  return (
    <>
      <div>
        <p className="label">Speed</p>
        <p className="readout text-2xl">
          {spd}
          <span className="ml-1 text-sm text-muted">m/s</span>
        </p>
      </div>
      <div>
        <p className="label">{scraping ? "Terrain" : "Alt"}</p>
        <p className="readout text-2xl">
          {Math.round(agl)}
          <span className="ml-1 text-sm text-muted">m</span>
        </p>
      </div>
      <div>
        <p className="label">Heading</p>
        <p className="readout text-2xl">
          {hdg}
          <span className="ml-1 text-accent">{cardinalOf(heading)}</span>
        </p>
      </div>
    </>
  );
}

function Instruments() {
  const speed = useFlight((s) => s.speed);
  const agl = useFlight((s) => s.agl);
  const asl = useFlight((s) => s.asl);
  const heading = useFlight((s) => s.heading);
  const scraping = useFlight((s) => s.scraping);
  const low = agl < 8;
  const spd = speed < 10 ? speed.toFixed(1) : String(Math.round(speed));
  const hdg = String(Math.round(heading)).padStart(3, "0");
  return (
    <div className="flex flex-wrap gap-2">
      <section className={`panel px-4 py-3 ${low || scraping ? "border-accent" : ""}`}>
        <p className="label">Speed</p>
        <p className="readout mt-1 text-4xl">
          {spd}
          <span className="ml-1 text-lg text-muted">m/s</span>
        </p>
      </section>
      <section className={`panel px-4 py-3 ${low || scraping ? "border-accent" : ""}`}>
        <p className="label">{scraping ? "Terrain" : low ? "Low" : "Altitude"}</p>
        <p className="readout mt-1 text-4xl">
          {Math.round(agl)}
          <span className="ml-1 text-lg text-muted">m agl</span>
        </p>
        <p className="mt-1 text-sm text-muted">{Math.round(asl)} m above sea</p>
      </section>
      <section className="panel px-4 py-3">
        <p className="label">Heading</p>
        <p className="readout mt-1 text-4xl">
          {hdg}
          <span className="ml-2 text-accent">{cardinalOf(heading)}</span>
        </p>
      </section>
    </div>
  );
}

export function Hud() {
  const flying = useFlight((s) => s.flying);
  const paused = useFlight((s) => s.paused);
  const night = useFlight((s) => s.night);
  const wire = useFlight((s) => s.wire);
  const muted = useFlight((s) => s.muted);
  const locked = useFlight((s) => s.locked);
  const ready = useFlight((s) => s.ready);
  const start = useFlight((s) => s.start);
  const pause = useFlight((s) => s.pause);
  const resume = useFlight((s) => s.resume);
  const restart = useFlight((s) => s.restart);
  const menu = useFlight((s) => s.menu);
  const toggleNight = useFlight((s) => s.toggleNight);
  const toggleWire = useFlight((s) => s.toggleWire);
  const toggleMute = useFlight((s) => s.toggleMute);
  const touch = useTouch();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === "KeyF") toggleWire();
      if (e.code === "KeyN") toggleNight();
      if (e.code === "KeyM") {
        ensureAudio();
        toggleMute();
      }
      if (e.code === "Escape" && useFlight.getState().flying && !useFlight.getState().paused) {
        pause();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pause, toggleMute, toggleNight, toggleWire]);

  const showMenu = !flying || paused;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 select-none">
      <div className="vignette pointer-events-none absolute inset-0" />

      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col gap-3 p-4 md:p-6">
        <header className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start justify-between gap-2">
            <div className="panel flex items-center gap-2 px-3 py-2">
              <span className="mark" aria-hidden />
              <div>
                <p className="wordmark text-2xl">Alto</p>
                <p className="text-xs tracking-widest text-muted uppercase">Ridge survey</p>
              </div>
            </div>
            {flying && !paused ? (
              <button type="button" className="btn pointer-events-auto" onClick={pause}>
                Pause
              </button>
            ) : null}
          </div>
          <div className="btn-row pointer-events-auto grid grid-cols-4 gap-2 md:flex md:flex-wrap md:justify-end">
            <button
              type="button"
              className="btn"
              aria-pressed={!night}
              onClick={() => {
                if (night) toggleNight();
              }}
            >
              Day
            </button>
            <button
              type="button"
              className="btn"
              aria-pressed={night}
              onClick={() => {
                if (!night) toggleNight();
              }}
            >
              Night
            </button>
            <button type="button" className="btn" aria-pressed={wire} onClick={toggleWire}>
              Wire
            </button>
            <button
              type="button"
              className="btn"
              aria-pressed={!muted}
              onClick={() => {
                ensureAudio();
                toggleMute();
              }}
            >
              {muted ? "Sound" : "Mute"}
            </button>
          </div>
        </header>

        {flying && !paused ? (
          <div className="md:hidden">
            <div className="panel flex items-stretch justify-between gap-3 px-3 py-2">
              <Compact />
            </div>
          </div>
        ) : null}
      </div>

      {flying && !paused ? (
        <div className="absolute bottom-6 left-6 hidden max-w-xl md:block">
          <Instruments />
          {!touch && !locked ? (
            <p className="panel mt-3 inline-block px-3 py-2 text-sm text-fg">Click the view to look</p>
          ) : null}
          {!touch ? (
            <p className="panel mt-2 inline-block px-3 py-2 text-sm text-muted">
              Mouse looks · W thrusts · A rudder left · D rudder right · Shift boost · Space lift
            </p>
          ) : null}
        </div>
      ) : null}

      {showMenu ? (
        <div className="pointer-events-auto absolute inset-x-4 bottom-4 md:inset-x-auto md:bottom-6 md:left-6 md:w-[26rem]">
          <div className="panel p-5">
            <p className="label">{paused ? "Paused" : "Survey plane"}</p>
            <h1 className="wordmark mt-2 text-5xl">Alto</h1>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              The craft holds altitude. Point the nose with the mouse, then thrust. Ridges are solid — you scrape, you
              don't sink.
            </p>
            <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-muted">
              <li>
                <span className="text-fg">Mouse</span> look
              </li>
              <li>
                <span className="text-fg">W / S</span> thrust
              </li>
              <li>
                <span className="text-fg">A / D</span> rudder
              </li>
              <li>
                <span className="text-fg">Shift</span> boost
              </li>
              <li>
                <span className="text-fg">Space</span> lift
              </li>
              <li>
                <span className="text-fg">F / N</span> wire / night
              </li>
            </ul>
            <div className="mt-5 flex flex-wrap gap-2">
              {!flying ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    ensureAudio();
                    start();
                    lockLook();
                  }}
                >
                  Start
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={(e) => {
                      e.currentTarget.blur();
                      resume();
                      lockLook();
                    }}
                  >
                    Resume
                  </button>
                  <button type="button" className="btn" onClick={restart}>
                    Restart
                  </button>
                  <button type="button" className="btn" onClick={menu}>
                    Menu
                  </button>
                </>
              )}
            </div>
            {!ready ? <p className="mt-3 text-sm text-muted">Charting the ridge…</p> : null}
          </div>
        </div>
      ) : null}

      {flying && !paused && touch ? (
        <div className="pointer-events-auto absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4">
          <div className="grid grid-cols-3 gap-2">
            <span />
            <Hold code="KeyW" label="W" />
            <span />
            <Hold code="KeyA" label="A" />
            <Hold code="KeyS" label="S" />
            <Hold code="KeyD" label="D" />
          </div>
          <div className="grid grid-cols-1 gap-2">
            <Hold code="Space" label="Lift" />
            <Hold code="ShiftLeft" label="Boost" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
