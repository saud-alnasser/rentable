// How a form on the shared form surface opens and submits: `surfaceForm`, the superforms options
// every schema form spreads first into its `superForm` call, `seed`, how a schema form opens on
// the values it starts with without counting them as changes, and `onSubmit`, the submit of a
// form that has nothing to validate. `isDirty` is how a form without a schema says it has changes,
// so the surface asks before closing it. The surface that draws a form is the design package's;
// what a form asks for and what its submit writes are its feature's.
export { isDirty } from './dirty';
export { onSubmit, seed, surfaceForm } from './form';
