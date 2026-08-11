import type { GoogleDriveConflictKind, GoogleDriveLinkConflict } from '$lib/platform/tauri';
import type { TranslationFunctions } from '$lib/i18n/i18n-types';

/**
 * CONFLICT PRESENTATION
 *
 * What each kind of remote conflict is called and what it offers, as one table keyed by kind.
 *
 * Every screen that can raise a conflict reads this, so the same situation cannot come to be
 * described differently depending on where the user met it. Before this the wording lived in
 * six parallel ladders inside the panel and a seventh copy — a nested ternary — in the startup
 * host's header, and the two had already drifted apart in what they showed.
 *
 * The `message` on a conflict wins where it is set: it is the reason from the remote, which is
 * more specific than the kind's own wording. A kind whose description ignores it is one that
 * throws away the only thing the remote told us.
 */

/** What a conflict says on whichever screen raised it. */
export type ConflictPresentation = {
	title: string;
	description: string;
	localDescription: string;
	remoteDescription: string;
	keepLocalLabel: string;
	/** Absent where the kind offers no remote copy to take. */
	useRemoteLabel?: string;
};

/**
 * The presentation for one conflict.
 *
 * @param conflict the conflict as the remote reported it
 * @param LL the translation functions for the reader's locale
 */
export function getConflictPresentation(
	conflict: GoogleDriveLinkConflict,
	LL: TranslationFunctions
): ConflictPresentation {
	const email = conflict.accountEmail;

	const byKind: Record<GoogleDriveConflictKind, ConflictPresentation> = {
		sync: {
			title: LL.settings.syncConflictTitle(),
			description: LL.settings.syncConflictDescription(),
			localDescription: LL.settings.syncConflictLocalDescription(),
			remoteDescription: LL.settings.syncConflictRemoteDescription({ email }),
			keepLocalLabel: LL.settings.syncConflictKeepLocalAction(),
			useRemoteLabel: LL.settings.syncConflictUseRemoteAction()
		},
		link: {
			title: LL.settings.syncLinkConflictTitle(),
			description: LL.settings.syncLinkConflictDescription(),
			localDescription: LL.settings.syncLinkConflictLocalDescription(),
			remoteDescription: LL.settings.syncLinkConflictRemoteDescription({ email }),
			keepLocalLabel: LL.settings.syncLinkKeepLocalAction(),
			useRemoteLabel: LL.settings.syncLinkUseRemoteAction()
		},
		relink: {
			title: LL.settings.syncRelinkRequiredTitle(),
			description: conflict.message ?? LL.settings.syncRelinkRequiredDescription(),
			localDescription: LL.settings.syncRelinkRequiredLocalDescription(),
			remoteDescription: LL.settings.syncRelinkRequiredRemoteDescription({ email }),
			keepLocalLabel: LL.settings.syncRelinkRequiredAction()
		},
		corrupt: {
			title: LL.settings.syncCorruptTitle(),
			description: conflict.message ?? LL.settings.syncCorruptDescription(),
			localDescription: LL.settings.syncCorruptLocalDescription(),
			remoteDescription: LL.settings.syncCorruptRemoteDescription({ email }),
			keepLocalLabel: LL.settings.syncCorruptKeepLocalAction()
		}
	};

	return byKind[conflict.kind];
}
