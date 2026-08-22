// The recurrence engine (P2-08). Re-exported from the barrel — rolldown (web) doesn't resolve an
// exports subpath, and `sideEffects: false` lets bundlers tree-shake rrule out of schema-only
// consumers regardless.
export * from "./presets"
export * from "./recurrence"
export {
  type NewStatus,
  type NewStatusGroup,
  newStatusGroupSchema,
  newStatusSchema,
  reorderSchema,
  type Status,
  type StatusCategory,
  type StatusGroup,
  statusCategorySchema,
  statusGroupSchema,
  statusIdSchema,
  statusSchema,
  type UpdateStatus,
  type UpdateStatusGroup,
  type UpdateUserSettings,
  type UserSettings,
  updateStatusGroupSchema,
  updateStatusSchema,
  updateUserSettingsSchema,
  userSettingsSchema,
} from "./status"
export {
  type NewTag,
  newTagSchema,
  type Tag,
  type TaskTag,
  tagIdSchema,
  tagSchema,
  taskTagSchema,
  type UpdateTag,
  updateTagSchema,
} from "./tag"
export {
  type NewTask,
  newTaskSchema,
  type Regen,
  regenSchema,
  type SetParent,
  type SetRecurrence,
  setParentSchema,
  setRecurrenceSchema,
  type Task,
  taskIdSchema,
  taskSchema,
  type UpdateTask,
  updateTaskSchema,
} from "./task"
