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
