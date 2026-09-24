import { writable, type Readable } from 'svelte/store';

/**
 * APPEARANCE
 *
 * whether the application draws light or dark. The token layer holds both (light on `:root`,
 * dark under `.dark`), and this is the one place that chooses between them, by the class on
 * `<html>`.
 *
 * **What the reader sets is not what is drawn.** `system` is a setting and never an appearance:
 * it resolves to light or dark through `prefers-color-scheme`, and it is followed live, so a
 * machine that turns dark at sunset takes the application with it without a relaunch. `light` and
 * `dark` pin it.
 *
 * **Applied before the window is shown.** The window is created hidden and startup shows it, so
 * the first frame a reader sees is already in the right appearance. Until a setting is applied
 * the instance follows the system, which is also what a machine whose settings could not be read
 * gets.
 *
 * *`light-dark()` and Tauri's `setTheme` were the rejected alternatives (effort 832, plan,
 * Architecture 2).*
 */

export const APPEARANCES = ['system', 'light', 'dark'] as const;

export type AppearanceSetting = (typeof APPEARANCES)[number];
export type ResolvedAppearance = 'light' | 'dark';

/** a stored value as a setting, reading anything unrecognised (an older file, none) as system. */
export function toAppearanceSetting(value: unknown): AppearanceSetting {
	return APPEARANCES.includes(value as AppearanceSetting) ? (value as AppearanceSetting) : 'system';
}

/** what a setting draws, given whether the system currently prefers dark. */
export function resolveAppearance(
	setting: AppearanceSetting,
	systemPrefersDark: boolean
): ResolvedAppearance {
	if (setting === 'system') {
		return systemPrefersDark ? 'dark' : 'light';
	}

	return setting;
}

/** the part of `<html>` this writes to. */
export type AppearanceRoot = {
	classList: { toggle(token: string, force?: boolean): unknown };
	style: { colorScheme: string };
};

/** the part of a `MediaQueryList` this reads. */
export type AppearanceMedia = {
	readonly matches: boolean;
	addEventListener(type: 'change', listener: () => void): void;
	removeEventListener(type: 'change', listener: () => void): void;
};

export type Appearance = {
	/** what the reader chose, and what the store below resolves it to. */
	readonly setting: AppearanceSetting;
	/** the appearance being drawn, for what cannot read the class (the toaster). */
	readonly resolved: Readable<ResolvedAppearance>;
	/** choose a setting and draw it at once. Anything unrecognised is system. */
	apply(setting: unknown): void;
	/** stop following the system. */
	dispose(): void;
};

/**
 * An appearance over a root element and the `prefers-color-scheme: dark` query.
 *
 * It follows the system from the moment it is made, and draws immediately, so there is never a
 * moment where the root carries neither appearance's class by accident. The media listener is
 * held for the instance's life and consulted only while the setting is system.
 */
export function createAppearance(root: AppearanceRoot, media: AppearanceMedia | null): Appearance {
	let setting: AppearanceSetting = 'system';
	const resolved = writable<ResolvedAppearance>('light');

	const draw = () => {
		const next = resolveAppearance(setting, media?.matches ?? false);

		root.classList.toggle('dark', next === 'dark');
		root.style.colorScheme = next;
		resolved.set(next);
	};

	const onSystemChange = () => {
		if (setting === 'system') {
			draw();
		}
	};

	media?.addEventListener('change', onSystemChange);
	draw();

	return {
		get setting() {
			return setting;
		},
		resolved: { subscribe: resolved.subscribe },
		apply(value) {
			setting = toAppearanceSetting(value);
			draw();
		},
		dispose() {
			media?.removeEventListener('change', onSystemChange);
		}
	};
}

let browser: Appearance | null = null;

/**
 * The application's one appearance, over `document.documentElement`.
 *
 * Made on first use and kept, since the class it writes is global to the window. The first use is
 * the startup ports being assembled, which is before anything is shown.
 */
export function browserAppearance(): Appearance {
	browser ??= createAppearance(
		document.documentElement,
		typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null
	);

	return browser;
}
