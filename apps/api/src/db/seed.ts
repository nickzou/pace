import { db } from "."
import { statuses, statusGroups, userSettings } from "./statuses"

// Seed a new user's default status library (P2-03): one default group holding
// To Do (open) + Done (done), plus their settings row (feature off until they opt in).
// Runs from the Better Auth user.create.after hook so every account is consistent from
// t=0 — the rows exist server-side and sync to the device before the first task. Wrapped
// in a transaction so a partial failure can't leave a user without defaults.
export async function seedUserStatuses(userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [group] = await tx
      .insert(statusGroups)
      .values({ userId, name: "Default", isDefault: true, position: 0 })
      .returning({ id: statusGroups.id })
    if (!group) throw new Error("seedUserStatuses: failed to create the default status group")

    await tx.insert(statuses).values([
      {
        userId,
        groupId: group.id,
        name: "To Do",
        color: "slate",
        category: "open",
        position: 0,
        isSystem: true,
      },
      {
        userId,
        groupId: group.id,
        name: "Done",
        color: "green",
        category: "done",
        position: 1,
        isSystem: true,
      },
    ])

    await tx.insert(userSettings).values({ userId, customStatusesEnabled: false })
  })
}
