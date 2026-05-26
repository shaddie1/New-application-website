# @onyxhawk/mobile

Expo (React Native) app for OnyxHawk customers and crew (role-gated). One codebase, two views.

## Setup

```powershell
pnpm install            # from the repo root
pnpm --filter @onyxhawk/mobile dev
```

Then press `i` (iOS sim), `a` (Android emulator), or scan the QR with Expo Go.

## Web preview (no sim required)

```powershell
pnpm --filter @onyxhawk/mobile web
```

Useful for quick design iteration; the booking flow's native bits (camera, push) only work on a real device.

## Stack
- Expo SDK 52 (new architecture enabled)
- Expo Router (typed routes)
- NativeWind 4 — Tailwind classes
- Shared design tokens from `@onyxhawk/ui-tokens`
- Shared DTO types from `@onyxhawk/types`

## Layout

```
app/
  _layout.tsx     Root stack — sets background + safe area
  index.tsx       Home (mockup 03) — placeholder sketch
src/              (planned) feature modules: auth, catalog, booking, payments, profile
global.css        NativeWind base/components/utilities
tailwind.config.js  Uses tokens from packages/ui-tokens
```
