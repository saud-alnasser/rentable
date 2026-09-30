// How a form on the shared form surface submits: `surfaceForm`, the superforms options every
// schema form spreads first into its `superForm` call, and `onSubmit`, the submit of a form that
// has nothing to validate. The surface that draws a form is the design package's; what a form
// asks for and what its submit writes are its feature's.
export { onSubmit, surfaceForm } from './form';
