import { STATUS_COLORS } from "@pace/tokens"
import { usePowerSync } from "@powersync/react"
import { Check, Plus, Tag as TagIcon } from "lucide-react"
import { type ReactNode, useEffect, useState } from "react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu"
import { assignTag, createTag, recolorTag, renameTag, unassignTag } from "#/lib/tags/mutations"
import { statusHex } from "#/lib/tasks/status-control"
import { useTheme } from "#/lib/theme"
import { cn } from "#/lib/utils"

export type TagOption = { id: string; name: string; color: string }

// Read-only pills for a task's tags. Overflow beyond `max` collapses to a +k chip.
export function TagChips({ tags, max = 3 }: { tags: TagOption[]; max?: number }) {
  const { theme } = useTheme()
  if (tags.length === 0) return null
  const shown = tags.slice(0, max)
  const extra = tags.length - shown.length
  return (
    <span className="flex flex-wrap items-center gap-1">
      {shown.map((t) => (
        <span
          key={t.id}
          className="rounded-full px-1.5 py-0.5 text-[11px] font-medium text-white"
          style={{ backgroundColor: statusHex(t.color, theme) }}
        >
          {t.name}
        </span>
      ))}
      {extra > 0 ? <span className="text-[11px] text-muted-foreground">+{extra}</span> : null}
    </span>
  )
}

// Assign/unassign tags on a task, with inline create-and-assign. The trigger defaults to a
// small "Tags" button; pass `children` (a single element) to use a custom trigger.
export function TagPicker({
  taskId,
  assignedIds,
  allTags,
  nextPosition,
  children,
}: {
  taskId: string
  assignedIds: Set<string>
  allTags: TagOption[]
  nextPosition: number
  children?: ReactNode
}) {
  const db = usePowerSync()
  const [newName, setNewName] = useState("")

  const toggle = (tagId: string) => {
    if (assignedIds.has(tagId)) void unassignTag(db, taskId, tagId)
    else void assignTag(db, taskId, tagId)
  }
  const createAndAssign = async () => {
    const name = newName.trim()
    if (!name) return
    const color = STATUS_COLORS[nextPosition % STATUS_COLORS.length] as string
    const id = await createTag(db, name, color, nextPosition)
    await assignTag(db, taskId, id)
    setNewName("")
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {children ?? (
          <button
            type="button"
            aria-label="Edit tags"
            className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <TagIcon className="size-3" /> Tags
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-60">
        {allTags.length === 0 ? (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">
            No tags yet — create one below.
          </p>
        ) : (
          allTags.map((t) => (
            <EditableTagRow
              key={t.id}
              tag={t}
              assigned={assignedIds.has(t.id)}
              onToggle={() => toggle(t.id)}
            />
          ))
        )}
        <div className="mt-1 flex items-center gap-1 border-t border-border px-1.5 pt-1.5">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              // Keep radix's menu typeahead from stealing the keystrokes.
              e.stopPropagation()
              if (e.key === "Enter") {
                e.preventDefault()
                void createAndAssign()
              }
            }}
            placeholder="New tag…"
            className="min-w-0 flex-1 rounded border border-input bg-background px-1.5 py-1 text-xs outline-none focus:border-ring"
          />
          <button
            type="button"
            onClick={() => void createAndAssign()}
            disabled={!newName.trim()}
            aria-label="Create tag"
            className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          >
            <Plus className="size-3.5" />
          </button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// A tag row inside the picker: a checkbox toggles it on the task; the colour dot opens a
// swatch recolour; the name is an inline rename. So a tag can be edited (name + colour)
// from anywhere the picker is — the list rows, the modal, and the detail — not just Settings.
function EditableTagRow({
  tag,
  assigned,
  onToggle,
}: {
  tag: TagOption
  assigned: boolean
  onToggle: () => void
}) {
  const db = usePowerSync()
  const { theme } = useTheme()
  const [name, setName] = useState(tag.name)
  const [picking, setPicking] = useState(false)
  useEffect(() => setName(tag.name), [tag.name])

  const saveName = () => {
    const trimmed = name.trim()
    if (trimmed && trimmed !== tag.name) void renameTag(db, tag.id, trimmed)
    else setName(tag.name)
  }

  return (
    <div className="flex flex-col gap-1 px-1.5 py-1">
      <div className="flex items-center gap-2 text-sm">
        <button
          type="button"
          onClick={onToggle}
          aria-label={assigned ? `Unassign ${tag.name}` : `Assign ${tag.name}`}
          className={cn(
            "flex size-4 shrink-0 items-center justify-center rounded border",
            assigned ? "border-primary bg-primary text-primary-foreground" : "border-input",
          )}
        >
          {assigned ? <Check className="size-3" /> : null}
        </button>
        <button
          type="button"
          onClick={() => setPicking((p) => !p)}
          aria-label={`Change ${tag.name} colour`}
          className="size-2.5 shrink-0 rounded-full ring-ring ring-offset-1 ring-offset-popover transition hover:ring-2"
          style={{ backgroundColor: statusHex(tag.color, theme) }}
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === "Enter") e.currentTarget.blur()
          }}
          aria-label={`Rename ${tag.name}`}
          className="min-w-0 flex-1 truncate rounded border border-transparent bg-transparent px-1 py-0.5 outline-none focus:border-ring focus:bg-background"
        />
      </div>
      {picking ? (
        <div className="flex flex-wrap gap-1 pl-6">
          {STATUS_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={c}
              onClick={() => {
                void recolorTag(db, tag.id, c)
                setPicking(false)
              }}
              className={cn(
                "size-4 rounded-full transition-transform hover:scale-110",
                tag.color === c && "ring-2 ring-ring ring-offset-1 ring-offset-popover",
              )}
              style={{ backgroundColor: statusHex(c, theme) }}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
