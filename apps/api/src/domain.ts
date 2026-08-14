// The API's view of the shared domain. Re-exported from @pace/validation so the
// rest of apps/api imports "the domain" from one local place — and so the shared
// contract is proven to resolve across the workspace. The tRPC procedures
// validate their inputs against these.
export {
  type NewTask,
  newTaskSchema,
  type Task,
  taskIdSchema,
  taskSchema,
  type UpdateTask,
  updateTaskSchema,
} from "@pace/validation"

export {
  type Item,
  type NewItem,
  itemIdSchema,
  itemSchema,
  type UpdateItem,
  newItemSchema,
  updateItemSchema,
} from "@pace/validation"
