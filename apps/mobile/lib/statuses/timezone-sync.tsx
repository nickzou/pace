import { detectTimezone, setActiveTimezone } from "@pace/validation"
import { usePowerSync, useQuery } from "@powersync/react"
import { useEffect } from "react"
import { setTimezone } from "./mutations"

// Auto-detect the device's IANA timezone into user_settings (P2-08) so the server's recurrence math
// runs on the user's local calendar day. Active while `timezone_auto` is on (the default); writes
// only when the detected zone differs. Also publishes the effective zone as the app's active
// timezone (P2 Timezones), so the date helpers reason in the account zone. Renders nothing; mounted
// once inside the PowerSync provider.
export function TimezoneSync() {
  const db = usePowerSync()
  const { data } = useQuery<{ id: string; timezone: string | null; timezone_auto: number }>(
    "SELECT id, timezone, timezone_auto FROM user_settings LIMIT 1",
  )
  const row = data[0]
  useEffect(() => {
    if (!row) return
    const detected = detectTimezone()
    const auto = row.timezone_auto !== 0
    setActiveTimezone(auto ? detected : (row.timezone ?? detected))
    if (auto && detected && detected !== row.timezone) {
      void setTimezone(db, row.id, detected, true)
    }
  }, [db, row])
  return null
}
