/**
 * A refusal the caller can act on.
 *
 * **Two shapes, and the live run of 2026-08-18 is why.** A network failure or a 5xx is a moment
 * that will pass. A 4xx is Turso saying no on purpose, a group that does not exist, a name
 * already taken, a group that is delete-protected, and none of those is fixed by asking again.
 * Telling somebody to retry something that cannot succeed is worse than saying nothing.
 *
 * *The control plane's own refusal type, kept with the one code the two modules here raise. The
 * status is HTTP's because the control plane answered over HTTP; a hosted tier built on this
 * package later would answer the same way.*
 */
export class Refusal extends Error {
	readonly code: string;
	readonly status: number;

	constructor(code: string, status: number, message: string) {
		super(message);
		this.name = 'Refusal';
		this.code = code;
		this.status = status;
	}
}

/** the workspace's database could not be reached or acted on, for either of the two reasons. */
export const WORKSPACE_UNAVAILABLE = 'workspace_unavailable';
