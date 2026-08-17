// The API's view of the shared domain. Re-exported from @pace/validation so the
// rest of apps/api imports "the domain" from one local place — and so the shared
// contract is proven to resolve across the workspace. The tRPC procedures validate
// their inputs against these.
export {
  type NewStatus,
  type NewStatusGroup,
  type NewTask,
  newStatusGroupSchema,
  newStatusSchema,
  newTaskSchema,
  reorderSchema,
  type Status,
  type StatusCategory,
  type StatusGroup,
  statusCategorySchema,
  statusGroupSchema,
  statusIdSchema,
  statusSchema,
  type Task,
  taskIdSchema,
  taskSchema,
  type UpdateStatus,
  type UpdateStatusGroup,
  type UpdateTask,
  type UpdateUserSettings,
  type UserSettings,
  updateStatusGroupSchema,
  updateStatusSchema,
  updateTaskSchema,
  updateUserSettingsSchema,
  userSettingsSchema,
} from "@pace/validation"
