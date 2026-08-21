import { Settings } from "lucide-react"
import { Checkbox } from "#/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "#/components/ui/dialog"

// View settings (P2-07): a gear next to the layout switcher opening a small modal. For now it
// carries one toggle — "Show subtasks" — which decides whether subtasks are shown by default:
// expanded inline in the list, and surfaced as their own items in the flat views (table / board /
// calendar). Default off. Persistence is the caller's (localStorage).
export function ViewSettings({
  showSubtasks,
  onShowSubtasksChange,
}: {
  showSubtasks: boolean
  onShowSubtasksChange: (value: boolean) => void
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label="View settings"
          title="View settings"
          className="rounded-lg border border-border bg-card p-2 text-muted-foreground transition-colors hover:text-foreground [&_svg]:size-4"
        >
          <Settings />
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>View settings</DialogTitle>
          <DialogDescription>Options that apply to how tasks are displayed.</DialogDescription>
        </DialogHeader>
        <label
          htmlFor="view-show-subtasks"
          className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3"
        >
          <Checkbox
            id="view-show-subtasks"
            checked={showSubtasks}
            onCheckedChange={(v) => onShowSubtasksChange(v === true)}
            className="mt-0.5"
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium">Show subtasks</span>
            <span className="block text-xs text-muted-foreground">
              Expand subtasks inline in the list, and include them as their own items in the table,
              board, and calendar. You can still expand or collapse individual tasks in the list.
            </span>
          </span>
        </label>
      </DialogContent>
    </Dialog>
  )
}
