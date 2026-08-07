{
  description = "Pace — NixOS dev shell (Tauri toolchain + Playwright browsers)";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.05";

  outputs = { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs { inherit system; };
    in
    {
      # Native toolchain the project needs on NixOS. Rust (rustc/cargo) and
      # Node/pnpm come from the ambient profile.
      # Enter with `nix develop`, then e.g. `pnpm tauri dev` or
      # `pnpm --filter @pace/e2e test`.
      devShells.${system}.default = pkgs.mkShell {
        nativeBuildInputs = with pkgs; [
          cargo-tauri # the Tauri CLI, nix-built (the npm one's prebuilt binary won't run on NixOS)
          pkg-config
          gobject-introspection
          wrapGAppsHook3
          maestro # mobile (Expo/RN) e2e runner
          android-tools # adb, so Maestro can reach a device/emulator
        ];

        # GTK/WebKit stack Tauri compiles + links against.
        buildInputs = with pkgs; [
          at-spi2-atk
          atkmm
          cairo
          gdk-pixbuf
          glib
          gtk3
          harfbuzz
          librsvg
          libsoup_3
          pango
          webkitgtk_4_1
          openssl
        ];

        # Playwright (e2e): use the nix-provided browsers — Playwright's prebuilt
        # ones don't run on NixOS. Version-matched to @playwright/test (both
        # 1.59.1 here); keep them in lockstep when bumping either.
        PLAYWRIGHT_BROWSERS_PATH = "${pkgs.playwright-driver.browsers}";
        PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";

        # Maestro (mobile e2e): opt out of anonymous analytics.
        MAESTRO_CLI_NO_ANALYTICS = "1";

        shellHook = ''
          echo "🦀 Pace dev shell — rustc $(rustc --version 2>/dev/null | awk '{print $2}'); Playwright browsers wired"
        '';
      };
    };
}
