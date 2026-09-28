import type { Action } from 'svelte/action';

/**
 * The submit of a form that has nothing to validate.
 *
 * `FormSurface` takes an `enhance` action and applies it to the form element it owns, which is
 * what lets a form built on `sveltekit-superforms` run its own submit pipeline. A form whose
 * whole content is a choice between fixed values has no schema and no refusal to draw, so
 * declaring one would buy a pipeline to say that an enum is one of its members.
 *
 * What it still needs is the form's own submit: the surface's primary control is a `submit`
 * button, so pressing Enter in the panel has to reach the same place the button does, and the
 * browser's default navigation has to be stopped either way.
 *
 * *It is also what keeps those surfaces testable. A superforms SPA submit reaches SvelteKit's
 * `applyAction`, which the component runner does not carry, so a test of a form built on one
 * can assert what was rendered and never what submitting did.*
 */
export const onSubmit =
	(perform: () => void): Action<HTMLFormElement> =>
	(node) => {
		const submitted = (event: SubmitEvent) => {
			event.preventDefault();
			perform();
		};

		node.addEventListener('submit', submitted);

		return {
			destroy: () => node.removeEventListener('submit', submitted)
		};
	};

/**
 * The superforms options every schema form on the shared form surface submits with, spread first
 * into its `superForm` call.
 *
 * - **`SPA`**: the form is validated and written from the client, with no page action behind it.
 * - **`applyAction: false`**: a form here is mounted in the frame by a concept's host, above
 *   whatever route is open, so its result is the form's own. Applying it would write `page.form`
 *   and `page.status` for the route underneath, and set that page's status to 400 every time a
 *   submit is refused.
 * - **`autoFocusOnError: true`**: a refused submit moves focus to the first invalid field
 *   ([[rules/interface]], *Form surface*). Said rather than left to superforms' `'detect'`,
 *   which decides by the user agent.
 * - **`scrollToError`**: an options object, which superforms hands to `scrollIntoView`. Its
 *   default scrolls the window, and the field sits in the surface's own scrolling body, so a
 *   field below the fold would take focus out of sight.
 */
export const surfaceForm = {
	SPA: true,
	applyAction: false,
	autoFocusOnError: true,
	scrollToError: { block: 'nearest' }
} as const;
