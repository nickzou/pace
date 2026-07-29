{
  description = "Pace — dev tooling (Biome) for the monorepo";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.05";

  outputs = { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs { inherit system; };
    in
    {
      devShells.${system}.default = pkgs.mkShell {
        packages = [
          pkgs.biome
        ];

        shellHook = ''
          echo "🏃 Pace dev shell — $(biome --version)"
        '';
      };
    };
}
