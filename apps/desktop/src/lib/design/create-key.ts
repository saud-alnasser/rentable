import type { ShortcutCombination } from '@rentable/design/shortcut.js';
import type { ApplicationShortcut } from '$lib/design/shortcut-registry';

/**
 * THE CREATE KEY
 *
 * Ctrl or Cmd with N creates a record in the set on screen: whichever directory, embedded list or
 * settings directory is drawing its create control. It is an application shortcut like undo, so
 * the sheet lists it and the palette offers it by name, and it is answered by the one listener.
 *
 * *Why this key: WebView2 lets the page answer it when the page takes the keydown, which the
 * application's listener does for every key a registration claims
 * ([[efforts/832-the-interface-speaks-one-language-and-guides/evidence/prototypes/the-create-key]]).
 * So the key is claimed on every screen, a screen with no set included: there it is refused with
 * its reason rather than handed to the webview, which would open a window.*
 *
 * The whole decision is here rather than in the shell so it can be checked under Node: what the
 * key is, who answers it, and when it does nothing.
 */

/** Held with ctrl or command. Shift is not consulted, so a slip onto it still creates. */
export const CREATE_KEYS: ShortcutCombination = { key: 'n', command: true };

/** A set a record can be added to, as the create key reaches it. */
export type CreateTarget = {
	/** open the concept's create form, through the concept's host. */
	create: () => void;
};

/**
 * The create key, as a registration.
 *
 * @param onScreen the set on screen, or nothing where no set is. The last set drawn answers, so a
 * list opened inside a record answers over the page behind it.
 * @param isCovered whether a form or confirmation stands over the set. Pressing the key then does
 * nothing: opening the form again would throw away what is being typed into it.
 */
export function toCreateShortcut(
	onScreen: () => CreateTarget | undefined,
	isCovered: () => boolean
): ApplicationShortcut {
	return {
		id: 'create',
		scope: 'application',
		keys: [CREATE_KEYS],
		describe: (translations) => translations.common.actions.newRecord(),
		unavailable: (translations) =>
			onScreen() ? undefined : translations.common.ui.nothingToCreateHere(),
		run: () => {
			const target = onScreen();

			if (!target || isCovered()) {
				return;
			}

			target.create();
		}
	};
}
