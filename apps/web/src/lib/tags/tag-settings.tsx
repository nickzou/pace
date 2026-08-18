import { STATUS_COLORS } from "@pace/tokens"
import { usePowerSync, useQuery } from "@powersync/react"
import { X } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { createTag, deleteTag, recolorTag, renameTag } from "#/lib/tags/mutations"
import { statusHex } from "#/lib/tasks/status-control"
import { useTheme } from "#/lib/theme"
import { cn } from "#/lib/utils"

type TagRow = { id: string; name: string; color: string; position: number }

// The Settings tag-management section (P2-04). Tags are always on (no enable toggle) — a
// flat list with create / rename / recolour / delete, built like the P2-03 status settings.
export function TagsSettings() {
  const { data: tags } = useQuery<TagRow>(
    "SELECT id, name, color, position FROM tags ORDER BY position, created_at",
  )
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-glow">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Tags</h2>
      {tags.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tags yet — add one below.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {tags.map((t) => (
            <EditableTag key={t.id} tag={t} />
          ))}
        </ul>
      )}
      <AddTag nextPosition={tags.length} />
    </section>
  )
}

function EditableTag({ tag }: { tag: TagRow }) {
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
    <li className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 text-sm">
        <button
          type="button"
          aria-label={`Change ${tag.name} colour`}
          onClick={() => setPicking((p) => !p)}
          className="size-3 shrink-0 rounded-full ring-ring ring-offset-2 ring-offset-card transition hover:ring-2"
          style={{ backgroundColor: statusHex(tag.color, theme) }}
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          aria-label={`Rename ${tag.name}`}
          className="min-w-0 flex-1 truncate rounded border border-transparent bg-transparent px-1 py-0.5 outline-none focus:border-ring focus:bg-background"
        />
        <button
          type="button"
          aria-label={`Delete ${tag.name}`}
          onClick={() => void deleteTag(db, tag.id)}
          className="shrink-0 text-muted-foreground transition-colors hover:text-destructive [&_svg]:size-3.5"
        >
          <X />
        </button>
      </div>
      {picking ? (
        <div className="flex flex-wrap gap-1.5 pl-5">
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
                "size-5 rounded-full transition-transform hover:scale-110",
                tag.color === c && "ring-2 ring-ring ring-offset-2 ring-offset-card",
              )}
              style={{ backgroundColor: statusHex(c, theme) }}
            />
          ))}
        </div>
      ) : null}
    </li>
  )
}

function AddTag({ nextPosition }: { nextPosition: number }) {
  const db = usePowerSync()
  const { theme } = useTheme()
  const [name, setName] = useState("")
  const [color, setColor] = useState<string>(STATUS_COLORS[0])

  const add = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    void createTag(db, trimmed, color, nextPosition)
    setName("")
  }

  return (
    <div className="mt-1 flex flex-col gap-2 border-t border-border pt-3">
      <div className="flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New tag…"
          className="flex-1"
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
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
