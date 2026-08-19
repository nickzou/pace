{
  description = "Pace — NixOS dev shell (Tauri toolchain + Playwright browsers; `.#android` for local mobile emulator + Maestro)";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.05";

  outputs = { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs { inherit system; };

      # Android SDK + emulator + system image for running the mobile Maestro e2e against a
      # LOCAL emulator (CI uses reactivecircus/android-emulator-runner instead). The SDK is
      # unfree and needs license acceptance, so use a dedicated pkgs instance rather than
      # flipping allowUnfree for the whole default shell. Heavy (~GBs) — hence its own
      # `.#android` shell, not the default one.
      androidPkgs = import nixpkgs {
        inherit system;
        config = {
          allowUnfree = true;
          android_sdk.accept_license = true;
        };
      };
      androidComposition = androidPkgs.androidenv.composeAndroidPackages {
        # 36 to compile against (Expo 57 / RN 0.86 target compileSdk 36); 34 for the
        # emulator system image (the emulator API is independent of the build's compileSdk).
        platformVersions = [ "36" "34" ];
        systemImageTypes = [ "google_apis" ];
        abiVersions = [ "x86_64" ]; # x86_64 so the emulator uses KVM acceleration
        includeEmulator = true;
        includeSystemImages = true;
        includeNDK = true;
        # The NDK we ship for the local gradle APK build. RN 0.86.2 actually asks for
        # 27.0.12077973, which isn't in this nixpkgs; nixos.init.gradle pins every module to
        # whatever IS here, so the listed version just has to exist.
        ndkVersions = [ "27.1.12297006" ];
        cmakeVersions = [ "3.22.1" ]; # RN's native build uses CMake
      };
      androidSdk = androidComposition.androidsdk;
      androidHome = "${androidSdk}/libexec/android-sdk";
    in
    {
      devShells.${system} = {
        # Native toolchain the project needs on NixOS. Rust (rustc/cargo) and Node/pnpm
        # come from the ambient profile. Enter with `nix develop`, then e.g. `pnpm tauri
        # dev` or `pnpm --filter @pace/e2e test`.
        default = pkgs.mkShell {
          nativeBuildInputs = with pkgs; [
            cargo-tauri # the Tauri CLI, nix-built (the npm one's prebuilt binary won't run on NixOS)
            pkg-config
            gobject-introspection
            wrapGAppsHook3
            maestro # mobile (Expo/RN) e2e runner
            android-tools # adb, so Maestro can reach a device/emulator
            xvfb-run # headless X for the desktop (Tauri/WebKitWebDriver) e2e
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

          # Desktop e2e (WebdriverIO + tauri-driver): the native WebDriver that
          # tauri-driver proxies to. Not on PATH from buildInputs, so hand its
          # store path to wdio.conf via --native-driver. (tauri-driver itself is
          # cargo-installed — see desktop-e2e/README.md — since it's not packaged.)
          WEBKIT_WEB_DRIVER = "${pkgs.webkitgtk_4_1}/bin/WebKitWebDriver";

          shellHook = ''
            echo "🦀 Pace dev shell — rustc $(rustc --version 2>/dev/null | awk '{print $2}'); Playwright browsers wired"
          '';
        };

        # `nix develop .#android` — Android SDK + emulator + Maestro for running the mobile
        # e2e against a local emulator. Separate from the default shell because the SDK +
        # system image are unfree and heavy. Needs an app build (EAS APK or local gradle)
        # and a reachable PowerSync backend; see the shellHook hints.
        android = pkgs.mkShell {
          nativeBuildInputs = [
            androidSdk
            pkgs.maestro
            pkgs.jdk17 # avdmanager/gradle are JVM tools
          ];

          ANDROID_HOME = androidHome;
          ANDROID_SDK_ROOT = androidHome;
          MAESTRO_CLI_NO_ANALYTICS = "1";

          shellHook = ''
            export PATH="${androidHome}/platform-tools:${androidHome}/emulator:${androidHome}/cmdline-tools/latest/bin:$PATH"
            # avdmanager/emulator default to these; leaving them unset creates AVDs the
            # emulator then can't find (they were empty on entry).
            export ANDROID_USER_HOME="$HOME/.android"
            export ANDROID_AVD_HOME="$HOME/.android/avd"
            # Install the NixOS ⇄ Gradle toolchain shim so the local APK build "just works"
            # (redirects AAPT2 to the Nix-patched binary + pins NDK/build-tools to what the
            # Nix SDK ships). Guarded on the Nix SDK inside the script, so it's inert for CI
            # and other Android projects. The Gradle analogue of the Biome BIOME_BINARY trick.
            install -Dm644 ${./apps/mobile/gradle/nixos.init.gradle} "$HOME/.gradle/init.d/pace-nixos-android.init.gradle"
            echo "🤖 Pace android shell — ANDROID_HOME=$ANDROID_HOME (Gradle NixOS shim installed)"
            echo "   AVD:   avdmanager create avd -n pace -k 'system-images;android-34;google_apis;x86_64' --device pixel_6"
            echo "   boot:  emulator -avd pace -no-window -gpu swiftshader_indirect -no-snapshot -noaudio &"
            echo "   flows: pnpm --filter @pace/mobile test:e2e"
          '';
        };
      };
    };
}
