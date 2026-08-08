import type { ExpoConfig } from "expo/config"
import appJson from "./app.json"

// Dynamic config layered over app.json. In CI the nightly builds a preview APK
// that talks to the API over plain http (http://10.0.2.2:3001 from the
// emulator), so we permit cleartext traffic — but ONLY when PACE_ALLOW_CLEARTEXT=1
// (set by the mobile-nightly workflow), never in normal dev or production builds.
const base = appJson.expo as unknown as ExpoConfig

type Plugins = NonNullable<ExpoConfig["plugins"]>
const plugins: Plugins = [...(base.plugins ?? [])]

if (process.env.PACE_ALLOW_CLEARTEXT === "1") {
  plugins.push(["expo-build-properties", { android: { usesCleartextTraffic: true } }])
}

const config: ExpoConfig = { ...base, plugins }

export default config
