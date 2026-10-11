import { goto } from '$app/navigation';
import { get } from 'svelte/store';

import LL from '$lib/i18n/i18n-svelte';
import type { TranslationFunctions } from '$lib/i18n/i18n-types';

/**
 * What a state's steps do on screen: what a person would, through the real DOM, so the interface
 * reaches the state by its own handlers.
 *
 * Every finder waits, since the interface draws after its reads settle, and fails naming what it
 * looked for, which is what the bar shows when a step cannot be taken.
 */
export type Screen = {
	/** wait for an element by CSS selector, or by its accessible role and name. */
	find: (target: Target) => Promise<HTMLElement>;
	/** click an element. */
	click: (target: Target) => Promise<HTMLElement>;
	/** type into a field, replacing what it held, as input events the form listens to. */
	type: (target: Target, text: string) => Promise<HTMLElement>;
	/** press a key on the element focused, or on a target. */
	press: (key: string, target?: Target) => Promise<void>;
	/** go to another path inside the app. */
	go: (path: string) => Promise<void>;
	/** wait a moment, for an animation to settle. */
	wait: (ms: number) => Promise<void>;
	/**
	 * the app's own strings in the language staged, so a step names a control by what it says in
	 * either language: `{ role: 'button', name: t.common.actions.edit() }`.
	 */
	t: TranslationFunctions;
};

/**
 * A CSS selector, or `{ role, name }` matched against the element's role (explicit or implicit)
 * and its accessible name (`aria-label`, or its text), `name` as text it contains or a pattern, or
 * an element a step already holds.
 */
export type Target = string | { role: string; name?: string | RegExp } | HTMLElement;

const IMPLICIT: Record<string, string> = {
	button: 'button',
	a: 'link',
	input: 'textbox',
	textarea: 'textbox',
	select: 'combobox',
	dialog: 'dialog',
	h1: 'heading',
	h2: 'heading',
	h3: 'heading'
};

const roleOf = (element: Element) =>
	element.getAttribute('role') ?? IMPLICIT[element.tagName.toLowerCase()] ?? null;

const nameOf = (element: Element) =>
	(element.getAttribute('aria-label') ?? element.textContent ?? '').replace(/\s+/g, ' ').trim();

const visible = (element: Element) =>
	element instanceof HTMLElement && element.getClientRects().length > 0;

const describe = (target: Target) =>
	typeof target === 'string'
		? target
		: target instanceof HTMLElement
			? target.tagName.toLowerCase()
			: `${target.role} "${target.name ?? ''}"`;

function query(target: Target): HTMLElement | null {
	if (target instanceof HTMLElement) return target.isConnected ? target : null;

	if (typeof target === 'string') {
		return [...document.querySelectorAll<HTMLElement>(target)].find(visible) ?? null;
	}

	const { role, name } = target;
	const matches = (element: Element) => {
		if (roleOf(element) !== role || !visible(element)) return false;
		if (name === undefined) return true;

		const text = nameOf(element);

		return typeof name === 'string' ? text.includes(name) : name.test(text);
	};

	return ([...document.querySelectorAll('*')].find(matches) as HTMLElement | undefined) ?? null;
}

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createScreen(timeout = 10_000): Screen {
	const find = async (target: Target) => {
		const until = Date.now() + timeout;

		for (;;) {
			const element = query(target);
			if (element) return element;
			if (Date.now() > until)
				throw new Error(`stage: nothing on screen matches ${describe(target)}`);
			await pause(50);
		}
	};

	const click = async (target: Target) => {
		const element = await find(target);
		element.scrollIntoView({ block: 'nearest' });

		// the pointer sequence, since bits-ui opens its menus and closes its layers on pointer events
		// and not on `click` alone.
		for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) {
			const Event = type.startsWith('pointer') ? PointerEvent : MouseEvent;
			element.dispatchEvent(new Event(type, { bubbles: true, cancelable: true, button: 0 }));
		}
		element.click();
		await pause(50);

		return element;
	};

	const type = async (target: Target, text: string) => {
		const element = (await find(target)) as HTMLInputElement | HTMLTextAreaElement;
		element.focus();

		// through the prototype's setter, so the framework sees the value change as a person typing.
		const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value')?.set;
		setter?.call(element, text);
		element.dispatchEvent(new InputEvent('input', { bubbles: true, data: text }));
		element.dispatchEvent(new Event('change', { bubbles: true }));
		await pause(50);

		return element;
	};

	const press = async (key: string, target?: Target) => {
		const element = target ? await find(target) : (document.activeElement ?? document.body);
		if (target) (element as HTMLElement).focus();

		element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
		element.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true, cancelable: true }));
		await pause(50);
	};

	// eslint-disable-next-line svelte/no-navigation-without-resolve -- staging moves between the app's own paths as written in a state
	const go = (path: string) => goto(path);

	return { find, click, type, press, go, wait: pause, t: get(LL) };
}
