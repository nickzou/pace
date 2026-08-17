import { STATUS_COLORS } from "@pace/tokens"
import { usePowerSync, useQuery } from "@powersync/react"
import { Trash2, X } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Switch } from "#/components/ui/switch"
import { statusHex } from "#/lib/tasks/status-control"
import { useTheme } from "#/lib/theme"
import { cn } from "#/lib/utils"
import {
  createGroup,
  createStatus,
  deleteGroup,
  deleteStatus,
  recolorStatus,
  renameGroup,
  renameStatus,
  setCustomStatusesEnabled,
} from "./mutations"

type GroupRow = { id: string; name: string; is_default: number; position: number }
type StatusRow = {
  id: string
  group_id: string
  name: string
  color: string
  category: string
  is_system: number
}

const CATEGORIES = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
]

// The Settings status-management section (P2-03): an enable toggle, then per-group status
// management. Reads live from local SQLite; writes replay through the connector. Delete
// affordances are hidden for the default group and system (To Do/Done) statuses, which
// the server also protects.
export function StatusesSettings() {
  const db = usePowerSync()
  const { data: settingsRows } = useQuery<{ id: string; custom_statuses_enabled: number }>(
    "SELECT id, custom_statuses_enabled FROM user_settings LIMIT 1",
  )
  const settings = settingsRows[0]
  const enabled = !!settings?.custom_statuses_enabled

  const { data: groups } = useQuery<GroupRow>(
    "SELECT id, name, is_default, position FROM status_groups ORDER BY position, created_at",
  )
  const { data: statuses } = useQuery<StatusRow>(
    "SELECT id, group_id, name, color, category, is_system, position FROM statuses ORDER BY position",
  )

  const byGroup = useMemo(() => {
    const map = new Map<string, StatusRow[]>()
    for (const s of statuses) {
      const arr = map.get(s.group_id) ?? []
      arr.push(s)
      map.set(s.group_id, arr)
    }
    return map
  }, [statuses])

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-glow">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Statuses
        </h2>
        <Switch
          aria-label="Enable custom statuses"
          disabled={!settings}
          checked={enabled}
          onCheckedChange={(next) =>
            settings && void setCustomStatusesEnabled(db, settings.id, next)
          }
        />
      </div>

      {enabled ? (
        <div className="flex flex-col gap-5">
          {groups.map((g) => (
            <GroupBlock key={g.id} group={g} statuses={byGroup.get(g.id) ?? []} />
          ))}
          <NewGroup nextPosition={groups.length} />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Turn this on to define your own statuses and lists.
        </p>
      )}
    </section>
  )
}

function GroupBlock({ group, statuses }: { group: GroupRow; statuses: StatusRow[] }) {
  const db = usePowerSync()
  const [name, setName] = useState(group.name)
  useEffect(() => setName(group.name), [group.name])

  const saveName = () => {
    const trimmed = name.trim()
    if (trimmed && trimmed !== group.name) void renameGroup(db, group.id, trimmed)
    else setName(group.name)
  }

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            aria-label={`Rename ${group.name} list`}
            className="min-w-0 flex-1 truncate rounded border border-transparent bg-transparent px-1 py-0.5 text-sm font-medium outline-none focus:border-ring focus:bg-background"
          />
          {group.is_default ? (
            <span className="shrink-0 text-sm text-muted-foreground">· default</span>
          ) : null}
        </div>
        {group.is_default ? null : (
          <button
            type="button"
            aria-label="Delete list"
            onClick={() => void deleteGroup(db, group.id)}
            className="text-muted-foreground transition-colors hover:text-destructive [&_svg]:size-4"
          >
            <Trash2 />
          </button>
        )}
      </div>

      <ul className="flex flex-col gap-1.5">
        {statuses.map((s) => (
          <EditableStatus key={s.id} status={s} />
        ))}
      </ul>

      <AddStatus groupId={group.id} nextPosition={statuses.length} />
    </div>
  )
}

// A status row that can be recoloured and renamed in place (system statuses too — only
// delete is protected). The colour dot toggles the same 12-swatch picker AddStatus uses;
// the name is an inline input that saves on blur. Category isn't editable here: the server
// enforces "≥1 open / ≥1 done per group" only on delete, so letting a category change slip
// through would let a user break that invariant. (Recolour/rename can't.)
function EditableStatus({ status }: { status: StatusRow }) {
  const db = usePowerSync()
  const { theme } = useTheme()
  const [name, setName] = useState(status.name)
  const [picking, setPicking] = useState(false)
  // Re-seed if the row changes under us (e.g. a rename synced from another device) — but
  // not mid-typing, since no local write lands until blur.
  useEffect(() => setName(status.name), [status.name])

  const saveName = () => {
    const trimmed = name.trim()
    if (trimmed && trimmed !== status.name) void renameStatus(db, status.id, trimmed)
    else setName(status.name)
  }

  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 text-sm">
        <button
          type="button"
          aria-label={`Change ${status.name} colour`}
          onClick={() => setPicking((p) => !p)}
          className="size-3 shrink-0 rounded-full ring-ring ring-offset-2 ring-offset-card transition hover:ring-2"
          style={{ backgroundColor: statusHex(status.color, theme) }}
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          aria-label={`Rename ${status.name}`}
          className="min-w-0 flex-1 truncate rounded border border-transparent bg-transparent px-1 py-0.5 outline-none focus:border-ring focus:bg-background"
        />
        <span className="shrink-0 text-xs text-muted-foreground">
          {status.category.replace("_", " ")}
        </span>
        {status.is_system ? null : (
          <button
            type="button"
            aria-label={`Delete ${status.name}`}
            onClick={() => void deleteStatus(db, status.id)}
            className="shrink-0 text-muted-foreground transition-colors hover:text-destructive [&_svg]:size-3.5"
          >
            <X />
          </button>
        )}
      </div>
      {picking ? (
        <div className="flex flex-wrap gap-1.5 pl-5">
          {STATUS_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={c}
              onClick={() => {
                void recolorStatus(db, status.id, c)
                setPicking(false)
              }}
              className={cn(
                "size-5 rounded-full transition-transform hover:scale-110",
                status.color === c && "ring-2 ring-ring ring-offset-2 ring-offset-card",
              )}
              style={{ backgroundColor: statusHex(c, theme) }}
            />
          ))}
        </div>
      ) : null}
    </li>
  )
}

function AddStatus({ groupId, nextPosition }: { groupId: string; nextPosition: number }) {
  const db = usePowerSync()
  const { theme } = useTheme()
  const [name, setName] = useState("")
  const [color, setColor] = useState<string>(STATUS_COLORS[0])
  const [category, setCategory] = useState("open")

  const add = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    void createStatus(db, groupId, trimmed, color, category, nextPosition)
    setName("")
  }

  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
      <div className="flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New status…"
          className="flex-1"
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="Category"
          className="rounded-lg border border-input bg-background px-2 text-sm text-foreground"
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <Button type="button" onClick={add} disabled={!name.trim()}>
          Add
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {STATUS_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={c}
            onClick={() => setColor(c)}
            className={cn(
              "size-5 rounded-full transition-transform hover:scale-110",
              color === c && "ring-2 ring-ring ring-offset-2 ring-offset-card",
            )}
            style={{ backgroundColor: statusHex(c, theme) }}
          />
        ))}
      </div>
    </div>
  )
}

function NewGroup({ nextPosition }: { nextPosition: number }) {
  const db = usePowerSync()
  const [name, setName] = useState("")
  const add = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    void createGroup(db, trimmed, nextPosition)
    setName("")
  }
  return (
    <div className="flex gap-2">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="New status list…"
        className="flex-1"
        onKeyDown={(e) => e.key === "Enter" && add()}
      />
      <Button type="button" variant="outline" onClick={add} disabled={!name.trim()}>
        Add list
      </Button>
    </div>
  )
}
