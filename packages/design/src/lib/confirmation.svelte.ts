import { toRefusal } from '#lib/confirmation.js';

/**
 * What a confirmation surface is told about itself, so the submission can be driven from here
 * rather than from the surface.
 *
 * Every member is read at the moment it is needed rather than captured once: `open`, the
 * handler and the translations are all props of a component that outlives any one attempt.
 */
export type ConfirmingSurface = {
	/** whether the surface is in front of the reader. */
	isOpen: () => boolean;
	/** the caller's handler, awaited before the surface closes. */
	perform: () => Promise<void> | void;
	/** close the surface, which is what an attempt that went through does. */
	close: () => void;
	/** what to show for a refusal that carries no message of its own. */
	unexpected: () => string;
};

/**
 * What a confirmation surface holds while it is offering itself: whether the call is in
 * flight, and the refusal the last attempt earned.
 *
 * It is here rather than in each dialog because the two surfaces that ask before something is
 * done — one naming a record, the other showing a plan over a set — differ in what they ask
 * and not at all in what pressing the control does. {@link toRefusal} beside it decides what
 * a failure says, so what the reader is shown is settled in the plain module and tested there.
 *
 * The reset is the constructor's own `$effect` rather than the caller's: a refusal describes
 * the attempt that earned it, and leaving one standing is what turned one refusal into a
 * dialog that could never be pressed again. A surface that had to remember to clear it is a
 * surface that can forget.
 */
export class ConfirmationSubmission {
	/** whether the call is in flight, which is what holds the control while it runs. */
	isSubmitting = $state(false);

	/** the refusal the last attempt earned, or `null` when there is nothing to show. */
	error = $state<string | null>(null);

	#surface: ConfirmingSurface;

	/**
	 * Construct it during the surface's own initialisation — the effect that clears a closed
	 * surface belongs to that component's lifetime, and a rune has no other owner to take.
	 */
	constructor(surface: ConfirmingSurface) {
		this.#surface = surface;

		$effect(() => {
			if (!surface.isOpen()) {
				this.isSubmitting = false;
				this.error = null;
			}
		});
	}

	/** Press the confirming control: run the caller's handler, and close where it went through. */
	submit = async () => {
		this.isSubmitting = true;
		// a refusal describes the attempt that earned it, not the one starting now.
		this.error = null;

		try {
			await this.#surface.perform();
			this.#surface.close();
		} catch (failure) {
			this.error = toRefusal(failure, this.#surface.unexpected());
		} finally {
			this.isSubmitting = false;
		}
	};
}
