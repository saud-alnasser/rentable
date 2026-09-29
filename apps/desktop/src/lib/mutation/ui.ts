// What of the mutation capability only the window can load: declaring a mutation, and announcing
// how one came out, both of which raise a toast. `index.ts` holds what loads under Node, the cache
// policy and the declaration's types (plan, *The canonical concept shape*).
export { declareMutation } from './mutation';
export { describeOutcomeChange, onMutationError, onMutationSuccess } from './announcement';
