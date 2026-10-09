// How a form on the shared form surface submits: `surfaceForm`, the superforms options every
// schema form spreads first into its `superForm` call, and `onSubmit`, the submit of a form that
// has nothing to validate. `isDirty` is how a form without a schema says it has changes, so the
// surface asks before closing it. The surface that draws a form is the design package's; what a
// form asks for and what its submit writes are its feature's.
export { isDirty } from './dirty';
export { onSubmit, surfaceForm } from './form';
