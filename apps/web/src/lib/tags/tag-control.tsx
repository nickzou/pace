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

// A task's tags as pills. Each chip opens a small edit popover (rename + recolour + remove).
// Overflow beyond `max` collapses to a +k chip. `taskId` enables the "Remove from task"
// action in the popover (present wherever a task's own tags are shown).
export function TagChips({
  tags,
  taskId,
  max = 3,
}: {
  tags: TagOption[]
  taskId?: string
  max?: number
}) {
  if (tags.length === 0) return null
  const shown = tags.slice(0, max)
  const extra = tags.length - shown.length
  return (
    <span className="flex flex-wrap items-center gap-1">
      {shown.map((t) => (
        <EditableChip key={t.id} tag={t} taskId={taskId} />
      ))}
      {extra > 0 ? <span className="text-[11px] text-muted-foreground">+{extra}</span> : null}
    </span>
  )
}

// One chip → a small popover to rename / recolour the tag (and remove it from the task).
function EditableChip({ tag, taskId }: { tag: TagOption; taskId?: string }) {
  const db = usePowerSync()
  const { theme } = useTheme()
  const [name, setName] = useState(tag.name)
  const [open, setOpen] = useState(false)
  useEffect(() => setName(tag.name), [tag.name])

  const saveName = () => {
    const trimmed = name.trim()
    if (trimmed && trimmed !== tag.name) void renameTag(db, tag.id, trimmed)
    else setName(tag.name)
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Edit ${tag.name}`}
          className="rounded-full px-1.5 py-0.5 text-[11px] font-medium text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: statusHex(tag.color, theme) }}
        >
          {tag.name}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="flex w-56 flex-col gap-2 p-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === "Enter") e.currentTarget.blur()
          }}
          aria-label={`Rename ${tag.name}`}
          className="w-full rounded border border-input bg-background px-2 py-1 text-sm outline-none focus:border-ring"
        />
        <div className="flex flex-wrap gap-1">
          {STATUS_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={c}
              onClick={() => void recolorTag(db, tag.id, c)}
              className={cn(
                "size-5 rounded-full transition-transform hover:scale-110",
                tag.color === c && "ring-2 ring-ring ring-offset-1 ring-offset-popover",
              )}
              style={{ backgroundColor: statusHex(c, theme) }}
            />
          ))}
        </div>
        {taskId ? (
          <button
            type="button"
            onClick={() => {
              if (taskId) void unassignTag(db, taskId, tag.id)
              setOpen(false)
            }}
            className="text-left text-xs text-muted-foreground transition-colors hover:text-destructive"
          >
            Remove from task
          </button>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// A dropdown to assign/unassign tags on a task, with inline create-and-assign. Editing a
// tag's name/colour lives on the chips (EditableChip) and in Settings. The trigger defaults
// to a small "Tags" button; pass `children` (a single element) to use a custom trigger.
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
  const { theme } = useTheme()
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
      <DropdownMenuContent align="start" className="min-w-52 p-1">
        {allTags.length === 0 ? (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">
            No tags yet — create one below.
          </p>
        ) : (
          allTags.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => toggle(t.id)}
              className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-sm transition-colors hover:bg-accent"
            >
              <span className="flex size-4 items-center justify-center">
                {assignedIds.has(t.id) ? <Check className="size-3.5" /> : null}
              </span>
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: statusHex(t.color, theme) }}
              />
              <span className="min-w-0 flex-1 truncate">{t.name}</span>
            </button>
          ))
        )}
        <div className="mt-1 flex items-center gap-1 border-t border-border px-1.5 pt-1.5">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
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
