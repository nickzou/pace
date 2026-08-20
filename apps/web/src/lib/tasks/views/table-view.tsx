import { usePowerSync } from "@powersync/react"
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table"
import { useVirtualizer } from "@tanstack/react-virtual"
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react"
import { useMemo, useRef, useState } from "react"
import { TagChips, TagPicker } from "#/lib/tags/tag-control"
import { cn } from "#/lib/utils"
import { dueDayState, formatDate } from "../dates"
import { setTaskStatus } from "../mutations"
import { StatusControl } from "../status-control"
import type { ListTask, TaskViewProps } from "./types"

// Table view (P2-07 · step 3). Headless @tanstack/react-table over the shared tasks, rendered as a
// CSS grid (so virtualised rows stay column-aligned without <table> layout quirks) and virtualised
// with @tanstack/react-virtual. Cells reuse the existing controls, so edits go through the same
// mutations. Header click sorts client-side (over the in-memory array); default = manual sort_order.
const col = createColumnHelper<ListTask>()

// One grid template shared by the header + every row so independent (absolutely-positioned) rows
// line up: status | title (flex) | tags | due.
const GRID = "grid grid-cols-[11rem_minmax(0,1fr)_15rem_8rem] items-center gap-3"
const ROW_H = 52

export default function TableView({
  tasks,
  statusesByGroup,
  tagsByTask,
  allTags,
  onOpen,
}: TaskViewProps) {
  const db = usePowerSync()
  const [sorting, setSorting] = useState<SortingState>([])

  const columns = useMemo(
    () => [
      col.accessor("status_name", {
        header: "Status",
        sortingFn: (a, b) =>
          a.original.status_category.localeCompare(b.original.status_category) ||
          a.original.status_name.localeCompare(b.original.status_name),
        cell: ({ row }) => {
          const t = row.original
          return (
            <StatusControl
              current={{
                id: t.status_id,
                name: t.status_name,
                color: t.status_color,
                category: t.status_category,
              }}
              options={statusesByGroup.get(t.status_group_id) ?? []}
              onSelect={(sid) => void setTaskStatus(db, t.id, sid)}
            />
          )
        },
      }),
      col.accessor("title", {
        header: "Title",
        cell: ({ row }) => {
          const t = row.original
          const resolved = t.status_category === "done"
          return (
            <button
              type="button"
              onClick={() => onOpen(t.id)}
              className="flex min-w-0 cursor-pointer items-center gap-2 text-left"
            >
              <span
                className={cn(
                  "min-w-0 truncate text-sm hover:underline",
                  resolved && "text-muted-foreground line-through",
                )}
              >
                {t.title}
              </span>
              {t.child_count > 0 ? (
                <span className="shrink-0 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {t.done_count}/{t.child_count}
                </span>
              ) : null}
            </button>
          )
        },
      }),
      col.display({
        id: "tags",
        header: "Tags",
        cell: ({ row }) => {
          const t = row.original
          const tags = tagsByTask.get(t.id) ?? []
          return (
            <div className="flex min-w-0 items-center gap-1">
              {tags.length > 0 ? <TagChips tags={tags} taskId={t.id} max={3} /> : null}
              <TagPicker
                taskId={t.id}
                assignedIds={new Set(tags.map((x) => x.id))}
                allTags={allTags}
                nextPosition={allTags.length}
              />
            </div>
          )
        },
      }),
      col.accessor("due_date", {
        header: "Due",
        sortingFn: (a, b) => (a.original.due_date ?? "").localeCompare(b.original.due_date ?? ""),
        cell: ({ row }) => {
          const t = row.original
          if (!t.due_date) return <span className="text-xs text-muted-foreground">—</span>
          const state = dueDayState(t.due_date, t.status_category === "done")
          return (
            <span
              className={cn(
                "text-xs",
                state === "overdue"
                  ? "text-destructive"
                  : state === "today"
                    ? "text-warning"
                    : "text-muted-foreground",
              )}
            >
              {formatDate(t.due_date, !!t.due_has_time)}
            </span>
          )
        },
      }),
    ],
    [db, statusesByGroup, tagsByTask, allTags, onOpen],
  )

  const table = useReactTable({
    data: tasks,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const rows = table.getRowModel().rows
  const scrollRef = useRef<HTMLDivElement>(null)
  const virt = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_H,
    overscan: 12,
  })

  return (
    <div
      ref={scrollRef}
      className="h-[70vh] overflow-auto rounded-xl border border-border bg-card shadow-glow"
    >
      {/* Sticky header */}
      {table.getHeaderGroups().map((hg) => (
        <div
          key={hg.id}
          className={cn(GRID, "sticky top-0 z-10 border-b border-border bg-card px-4 py-2")}
        >
          {hg.headers.map((h) => {
            const sorted = h.column.getIsSorted()
            return (
              <div key={h.id} className="text-xs font-medium text-muted-foreground">
                {h.column.getCanSort() ? (
                  <button
                    type="button"
                    onClick={h.column.getToggleSortingHandler()}
                    className="flex cursor-pointer items-center gap-1 hover:text-foreground"
                  >
                    {flexRender(h.column.columnDef.header, h.getContext())}
                    {sorted === "asc" ? (
                      <ArrowUp className="size-3" />
                    ) : sorted === "desc" ? (
                      <ArrowDown className="size-3" />
                    ) : (
                      <ChevronsUpDown className="size-3 opacity-40" />
                    )}
                  </button>
                ) : (
                  flexRender(h.column.columnDef.header, h.getContext())
                )}
              </div>
            )
          })}
        </div>
      ))}

      {/* Virtualised rows */}
      {rows.length === 0 ? (
        <p className="px-4 py-16 text-center text-sm text-muted-foreground">No tasks to show.</p>
      ) : (
        <div style={{ height: virt.getTotalSize(), position: "relative", width: "100%" }}>
          {virt.getVirtualItems().map((vr) => {
            const row = rows[vr.index]
            if (!row) return null
            return (
              <div
                key={row.id}
                className={cn(GRID, "border-b border-border px-4 hover:bg-accent/40")}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: ROW_H,
                  transform: `translateY(${vr.start}px)`,
                }}
              >
                {row.getVisibleCells().map((cell) => (
                  <div key={cell.id} className="min-w-0">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
