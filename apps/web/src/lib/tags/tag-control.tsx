import { STATUS_COLORS } from "@pace/tokens"
import { usePowerSync } from "@powersync/react"
import { Check, Plus, Tag as TagIcon } from "lucide-react"
import { type ReactNode, useState } from "react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu"
import { assignTag, createTag, unassignTag } from "#/lib/tags/mutations"
import { statusHex } from "#/lib/tasks/status-control"
import { useTheme } from "#/lib/theme"

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
      <DropdownMenuContent align="start" className="min-w-52">
        {allTags.length === 0 ? (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">
            No tags yet — create one below.
          </p>
        ) : (
          allTags.map((t) => (
            <DropdownMenuItem
              key={t.id}
              onSelect={(e) => {
                e.preventDefault()
                toggle(t.id)
              }}
            >
              <span className="flex size-4 items-center justify-center">
                {assignedIds.has(t.id) ? <Check className="size-3.5" /> : null}
              </span>
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: statusHex(t.color, theme) }}
              />
              <span className="min-w-0 flex-1 truncate">{t.name}</span>
            </DropdownMenuItem>
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
