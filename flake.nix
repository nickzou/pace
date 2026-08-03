{
  description = "Pace — Tauri desktop build toolchain (NixOS dev shell)";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.05";

  outputs = { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs { inherit system; };
    in
    {
      # Provides the native GTK/WebKit toolchain Tauri compiles + links against.
      # Rust (rustc/cargo) and Node/pnpm come from the ambient profile.
      # Enter with `nix develop`, then run `pnpm tauri dev`.
      devShells.${system}.default = pkgs.mkShell {
        nativeBuildInputs = with pkgs; [
          cargo-tauri # the Tauri CLI, nix-built (the npm one's prebuilt binary won't run on NixOS)
          pkg-config
          gobject-introspection
          wrapGAppsHook3
        ];

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

        shellHook = ''
          echo "🦀 Pace Tauri shell — rustc $(rustc --version 2>/dev/null | awk '{print $2}'), pkg-config $(pkg-config --version 2>/dev/null)"
        '';
      };
    };
}
