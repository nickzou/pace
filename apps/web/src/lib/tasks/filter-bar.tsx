import { Check, ChevronDown, X } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu"
import type { TagOption } from "#/lib/tags/tag-control"
import { statusHex } from "#/lib/tasks/status-control"
import { useTheme } from "#/lib/theme"
import { cn } from "#/lib/utils"
import { type Filters, hasActiveFilters } from "./filter"

type StatusOpt = { id: string; name: string; color: string; category: string }

// The multi-facet filter bar (P2-04): tag include (any/all), tag exclude, and status.
// Date lives in the sidebar smart views. State is owned by the route (URL); this just
// renders it and calls onChange with a patch.
export function FilterBar({
  filters,
  allTags,
  allStatuses,
  onChange,
  onClear,
}: {
  filters: Filters
  allTags: TagOption[]
  allStatuses: StatusOpt[]
  onChange: (patch: Partial<Filters>) => void
  onClear: () => void
}) {
  const { theme } = useTheme()
  const inc = new Set(filters.tags ?? [])
  const exc = new Set(filters.notTags ?? [])
  const stat = new Set(filters.status ?? [])
  const mode = filters.tagsMode === "all" ? "all" : "any"

  const toggle = (key: "tags" | "notTags" | "status", id: string) => {
    const cur = new Set(filters[key] ?? [])
    if (cur.has(id)) cur.delete(id)
    else cur.add(id)
    onChange({ [key]: cur.size ? [...cur] : undefined })
  }

  const tagById = new Map(allTags.map((t) => [t.id, t]))
  const statusById = new Map(allStatuses.map((s) => [s.id, s]))

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Include tags, with any/all mode */}
      <FacetMenu label="Tags" count={inc.size}>
        <div className="flex gap-1 border-b border-border px-1.5 pb-1.5">
          {(["any", "all"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onChange({ tagsMode: m === "all" ? "all" : undefined })}
              className={cn(
                "flex-1 rounded px-2 py-0.5 text-xs capitalize",
                mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground",
              )}
            >
              {m}
            </button>
          ))}
        </div>
        <TagList
          tags={allTags}
          selected={inc}
          onToggle={(id) => toggle("tags", id)}
          theme={theme}
        />
      </FacetMenu>

      {/* Exclude tags */}
      <FacetMenu label="Exclude" count={exc.size}>
        <TagList
          tags={allTags}
          selected={exc}
          onToggle={(id) => toggle("notTags", id)}
          theme={theme}
        />
      </FacetMenu>

      {/* Status */}
      <FacetMenu label="Status" count={stat.size}>
        {allStatuses.length === 0 ? (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">No statuses.</p>
        ) : (
          allStatuses.map((s) => (
            <DropdownMenuItem
              key={s.id}
              onSelect={(e) => {
                e.preventDefault()
                toggle("status", s.id)
              }}
            >
              <span className="flex size-4 items-center justify-center">
                {stat.has(s.id) ? <Check className="size-3.5" /> : null}
              </span>
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: statusHex(s.color, theme) }}
              />
              <span className="min-w-0 flex-1 truncate">{s.name}</span>
            </DropdownMenuItem>
          ))
        )}
      </FacetMenu>

      {/* Active-filter chips */}
      {[...inc].map((id) => (
        <Chip
          key={`i${id}`}
          label={tagById.get(id)?.name ?? "?"}
          onRemove={() => toggle("tags", id)}
        />
      ))}
      {[...exc].map((id) => (
        <Chip
          key={`e${id}`}
          label={`not ${tagById.get(id)?.name ?? "?"}`}
          onRemove={() => toggle("notTags", id)}
        />
      ))}
      {[...stat].map((id) => (
        <Chip
          key={`s${id}`}
          label={statusById.get(id)?.name ?? "?"}
          onRemove={() => toggle("status", id)}
        />
      ))}

      {hasActiveFilters(filters) ? (
        <button
          type="button"
          onClick={onClear}
          className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Clear all
        </button>
      ) : null}
    </div>
  )
}

function FacetMenu({
  label,
  count,
  children,
}: {
  label: string
  count: number
  children: React.ReactNode
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs transition-colors",
            count > 0
              ? "border-primary/50 bg-primary/10 text-foreground"
              : "border-border text-muted-foreground hover:bg-accent",
          )}
        >
          {label}
          {count > 0 ? <span className="font-medium">· {count}</span> : null}
          <ChevronDown className="size-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-48">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function TagList({
  tags,
  selected,
  onToggle,
  theme,
}: {
  tags: TagOption[]
  selected: Set<string>
  onToggle: (id: string) => void
  theme: "dark" | "light"
}) {
  if (tags.length === 0)
    return <p className="px-2 py-1.5 text-xs text-muted-foreground">No tags yet.</p>
  return (
    <>
      {tags.map((t) => (
        <DropdownMenuItem
          key={t.id}
          onSelect={(e) => {
            e.preventDefault()
            onToggle(t.id)
          }}
        >
          <span className="flex size-4 items-center justify-center">
            {selected.has(t.id) ? <Check className="size-3.5" /> : null}
          </span>
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: statusHex(t.color, theme) }}
          />
          <span className="min-w-0 flex-1 truncate">{t.name}</span>
        </DropdownMenuItem>
      ))}
    </>
  )
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs">
      <span className="max-w-32 truncate">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label}`}
        className="[&_svg]:size-3"
      >
        <X />
      </button>
    </span>
  )
}
