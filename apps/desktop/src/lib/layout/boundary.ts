import { toErrorDetail } from '$lib/error/message';
import type { DiagnosticFields } from '$lib/platform/diagnostics';

/**
 * BOUNDARY
 *
 * what the application writes down when a component throws while rendering.
 *
 * The catching itself is two `<svelte:boundary>` elements and belongs in the markup; what
 * reaches the diagnostics file is a decision about content and is made here, where it can be
 * read and checked without a window.
 */

/**
 * Which of the two boundaries caught it.
 *
 * A boundary renders its fallback in place of the subtree that threw, so one inside the shell
 * cannot catch the shell. `content` is everything a route draws, caught inside the chrome with
 * the chrome still standing. `shell` is the chrome itself, caught outside it, which is the only
 * state in the running application with no frame around it at all.
 */
export type CaughtErrorScope = 'content' | 'shell';

/** the one event both boundaries write under, so a reader greps for one word rather than two. */
export const CAUGHT_ERROR_EVENT = 'layout.boundary';

/**
 * How much of a stack is worth keeping.
 *
 * A render stack runs to hundreds of frames through the framework, and the file this lands in is
 * read by a person looking for the first few. Long enough to reach the component that threw,
 * short enough that one crash does not push the rest of the session's diagnostics out of view.
 */
export const STACK_LIMIT = 2000;

/** the marker left in place of what was cut, so a truncated stack cannot read as a whole one. */
const TRUNCATED = '…';

function toBoundedStack(error: unknown) {
	const stack = error instanceof Error ? error.stack : undefined;

	if (!stack?.trim()) {
		return undefined;
	}

	return stack.length > STACK_LIMIT ? `${stack.slice(0, STACK_LIMIT)}${TRUNCATED}` : stack;
}

/**
 * What one caught error leaves in the diagnostics file.
 *
 * Three fields and no more. The prose is read the way every other thrown value in this
 * application is read, so a component error and a refused command are described the same way.
 *
 * **A field with nothing in it is left out rather than written empty**, which is the sink's own
 * rule: a value written as nothing says it was measured and found empty, and a thrown string
 * carrying no stack was never measured.
 *
 * Nothing new leaves the machine. This is the local file every other diagnostic already goes to,
 * and redaction happens on the far side of the boundary that owns it.
 */
export function toCaughtErrorFields(scope: CaughtErrorScope, error: unknown): DiagnosticFields {
	return {
		scope,
		detail: toErrorDetail(error) ?? undefined,
		stack: toBoundedStack(error)
	};
}
