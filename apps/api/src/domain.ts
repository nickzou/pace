// The API's view of the shared domain. Re-exported from @pace/validation so the
// rest of apps/api imports "the domain" from one local place — and so the shared
// contract is proven to resolve across the workspace (M07). M08's tasks table +
// tRPC procedures validate against these.
export { type NewTask, newTaskSchema, type Task, taskSchema } from "@pace/validation"
