import RecordActionControl from '#lib/block/record-action-control.svelte';
import { suppliedStrings } from '#tests/contract-strings.js';
import Providers from '#tests/providers.svelte';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import SquarePenIcon from '@lucide/svelte/icons/square-pen';
import { beforeEach, expect, test, vi } from 'vitest';

/**
 * One control in a record page's action cluster, where the act cannot run for this record.
 *
 * Requirement 16 of effort 832, criterion 16(c): an act that cannot run is shown, refused, and says
 * why in one line on hover and focus. The control is therefore not the button's own `disabled`,
 * which would take it out of the keyboard's path and stop it taking the pointer, so its reason
 * could never be reached.
 */

beforeEach(() => {
	// the tooltip is placed against its trigger, and jsdom implements no ResizeObserver.
	window.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
});

const REASON = 'this contract is paid in full';

const show = (props: { unavailable?: string; onclick: () => void }) =>
	render(
		RecordActionControl,
		{ label: 'edit', icon: SquarePenIcon, ...props },
		{ wrapper: Providers, wrapperProps: { strings: suppliedStrings(), direction: 'ltr' } }
	);

const control = () => document.querySelector<HTMLButtonElement>('button');

test('an unavailable act is marked refused, stays reachable, and does not run', async () => {
	const onclick = vi.fn();

	show({ unavailable: REASON, onclick });

	expect(control()?.getAttribute('aria-disabled')).toBe('true');
	// reachable by the keyboard: the button's own disabled would take it out of the tab order.
	expect(control()?.disabled).toBe(false);

	await fireEvent.click(control()!);

	expect(onclick).not.toHaveBeenCalled();
});

test('its reason is its description, and the tooltip it opens on focus', async () => {
	show({ unavailable: REASON, onclick: () => {} });

	const describedBy = control()?.getAttribute('aria-describedby');

	expect(describedBy && document.getElementById(describedBy)?.textContent).toBe(REASON);

	await fireEvent.focus(control()!);

	await waitFor(() =>
		expect(document.querySelector('[data-slot=tooltip-content]')?.textContent).toContain(REASON)
	);
});

test('an act that can run is not marked, and runs', async () => {
	const onclick = vi.fn();

	show({ onclick });

	expect(control()?.hasAttribute('aria-disabled')).toBe(false);

	await fireEvent.click(control()!);

	expect(onclick).toHaveBeenCalledTimes(1);
});
