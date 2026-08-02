import { tauri } from '$lib/api/tauri';

import { LinkSessionFlow, type LinkSessionDriver, type LinkSessionHandlers } from './link-session';
import {
	cancelGoogleDriveLink,
	isGoogleDriveLinkCancellation,
	linkGoogleDriveWorkspace
} from './link';

/**
 * the real link operation.
 *
 * The phase subscription is opened before the link and closed after it, because
 * an event that arrives with nobody listening is the only way the interface can
 * miss the moment the user answered the consent screen.
 */
const googleDriveLinkSessionDriver: LinkSessionDriver = {
	link: async (onAuthorized) => {
		const unlisten = await tauri.remoteSync.googleDrive.onLinkPhase((phase) => {
			if (phase === 'finalizing') {
				onAuthorized();
			}
		});

		try {
			return await linkGoogleDriveWorkspace();
		} finally {
			unlisten();
		}
	},
	cancel: () => cancelGoogleDriveLink().then(() => undefined),
	isCancellation: isGoogleDriveLinkCancellation
};

/**
 * The reactive face of {@link LinkSessionFlow}. Owns nothing but the mirrors — every
 * decision is the flow's, so what a component reads here and what the tests exercise
 * there cannot drift apart.
 */
export class LinkSession {
	#flow: LinkSessionFlow;

	isAuthorizing = $state(false);
	isFinalizing = $state(false);

	/** true while authorization is outstanding or its result is being applied. */
	isLinking = $derived(this.isAuthorizing || this.isFinalizing);

	constructor(
		handlers: LinkSessionHandlers,
		driver: LinkSessionDriver = googleDriveLinkSessionDriver
	) {
		this.#flow = new LinkSessionFlow(driver, handlers);

		this.#flow.observe(() => {
			this.isAuthorizing = this.#flow.isAuthorizing;
			this.isFinalizing = this.#flow.isFinalizing;
		});
	}

	begin = () => this.#flow.begin();

	cancel = () => this.#flow.cancel();
}
