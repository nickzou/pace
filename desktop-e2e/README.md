# @pace/desktop-e2e

End-to-end tests for the **desktop** app (Tauri) — the web UI wrapped in a
native window, served from `tauri://localhost` and authenticating with a bearer
token. Playwright drives a browser and Maestro drives the phone; neither can
reach Tauri's WebKitWebView, so the desktop gets its own driver:
**WebdriverIO + `tauri-driver`**.

## How it fits together

```
wdio  ──►  tauri-driver  ──►  WebKitWebDriver  ──►  the packaged app (target/debug/app)
                                                        └─ web UI ─► API :3101 ─► pace_test
```

`wdio.conf.ts` is the whole harness. Before any session it:

1. resets an isolated `pace_test` database (create → migrate → truncate),
2. builds + starts the API on **:3101** with `TRUSTED_ORIGINS=tauri://localhost`
   (so Better Auth accepts the packaged app's origin),

then per session it spawns `tauri-driver` (pointed at the nix-store
`WebKitWebDriver` via `--native-driver $WEBKIT_WEB_DRIVER`), which launches the
app binary and bridges WebDriver commands into its webview.

The app **bakes `VITE_API_URL` at build time**, so the binary must be built
pointing at `:3101` — that's what `build:app` does.

## Prerequisites (one-time)

- **Enter the dev shell:** `nix develop` (provides `cargo-tauri`, the GTK/WebKit
  stack, `xvfb-run`, and exports `WEBKIT_WEB_DRIVER`).
- **Install `tauri-driver`** (not in nixpkgs): `cargo install tauri-driver`
  → lands in `~/.cargo/bin/tauri-driver`.
- **Postgres running** (the repo's `docker compose up -d`).

## Run it

```sh
# from repo root, inside `nix develop`:
pnpm --filter @pace/desktop-e2e test:build     # build the :3101 binary, then run
```

Iterating on a spec (skip the slow Rust rebuild once the binary exists):

```sh
pnpm --filter @pace/desktop-e2e test
```

Rebuild the binary after changing app code:

```sh
pnpm --filter @pace/desktop-e2e build:app
```

### Two build scripts: local vs CI

- **`build:app`** (local) — the nix-provided `cargo tauri build --debug
  --no-bundle`. Ergonomic, and what you run day to day.
- **`build:app:ci`** — the same via the **npm** Tauri CLI (`@tauri-apps/cli`).
  `ubuntu-latest` has no `cargo-tauri`, and the npm CLI's prebuilt binary runs
  there (just not on NixOS — hence the split). Used by
  `.github/workflows/desktop-e2e.yml`.

Both bake `VITE_API_URL=http://localhost:3101` and emit `target/debug/app`.
(A plain `cargo build` won't do: Tauri treats a bare debug build as *dev* and
loads `devUrl` instead of the bundled frontend — the CLI is what marks it a
bundled build.)

### Headless (no display / CI)

The app opens a real GTK window, so a display is required. With none, wrap it:

```sh
xvfb-run -a pnpm --filter @pace/desktop-e2e test:build
```

## Notes

- Selectors key off stable attributes (`input[autocomplete="…"]`, link/button
  text) because the web UI labels inputs with a wrapping `<span>`, not `for`/`id`.
- The suite reuses the Playwright suite's `:3101` / `pace_test` — run them one at
  a time, not concurrently.
