# Alto

Low-poly ridge survey flight. React 19, TanStack Start, Three.js, Zustand, Tailwind CSS v4. No accounts and no database — the game does not call auth or `src/lib/db`. Settings persist in `localStorage` under `alto-settings-v1`.

## Map

| Path | Role |
| --- | --- |
| `src/routes/index.tsx` | Full-viewport canvas. `ssr: false`. Lazy-loads the WebGL scene. |
| `src/game/FlightCanvas.tsx` | Renderer, craft, chase camera, simulation step. |
| `src/game/terrain.ts` | Deterministic heightfield (`WORLD = 520`), water, pines, rocks, beacons, pad. |
| `src/game/input.ts` | Keys, pointer look, virtual touch buttons. |
| `src/game/Hud.tsx` | Menu, instruments, day / night / wire / mute. |
| `src/game/store.ts` | Zustand session + persisted settings. |
| `src/game/audio.ts` | Procedural engine and scrape tones. |
| `src/styles.css` | Tokens: cream panels, pine greens, amber accent. Outfit body, Barlow Condensed wordmark. |

## Flight contract

The craft does not fall. Drag decays velocity. Thrust adds speed along the nose. Terrain collision lifts the craft to `sampleSurface + CLEARANCE` (1.75) and cancels inward velocity — scrape, never sink or explode.

Chase camera, do not invert steering:

- `readSteer()`: **A / ArrowLeft = +1** (nose left, left wing down). **D / ArrowRight = −1** (nose right).
- Mouse right decreases yaw (nose right). Mouse up increases pitch (nose up).
- W adds forward velocity (46, or 78 with Shift). S subtracts. Space adds upward velocity. Shift only boosts while thrusting.
- Yaw rate constant is `TURN` (1.25 rad/s at full rudder).

## Product rules

- The player aircraft is a high-wing survey plane built in `makeCraft()` (`src/game/FlightCanvas.tsx`): cowling, cabin glass, dihedral wings, struts, tail, gear, and a spinning two-blade prop. Keep that silhouette. Red nav light is on the left wing, green on the right.
- Day sky `#c5dceb`, night `#121a30`. Lambert terrain, flat low-poly props.
- Touch UI (coarse pointer or width under 860) uses hold buttons, not the keyboard hint.
- `prefers-reduced-motion` already damps camera and water — keep that path working.
- Do not add login routes or user-owned rows.

## Commands

```bash
npm run dev        # Vite through scripts/with-app-env.mjs, host 0.0.0.0, port 8080
npm run build
npm run typecheck
npm run test
```

Start Vite only through `npm run dev` / `npm run build`. The wrapper reads `.grok/app-env.json` so `VITE_AUTH_ENABLED` stays `"false"`. A direct `vite` process skips that file.

## Leave in place

`scripts/grok-pwa-plugin.mjs`, `server/middleware/grok-pwa.ts`, `public/__grok/`, and `<PreviewHostBridge />` in `src/routes/__root.tsx` belong to the app shell. Do not strip them to "clean up" the repo. Do not put `og:*` or `twitter:card` meta in `__root.tsx` — the PWA injector owns those. Share copy lives in `src/lib/og/site.json`.
