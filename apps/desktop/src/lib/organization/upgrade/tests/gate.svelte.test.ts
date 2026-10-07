import { fireEvent, render } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { beforeEach, expect, test, vi } from 'vitest';

import { placeholderStrings as strings } from '$lib/design/tests/strings';
import ar from '$lib/i18n/ar';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { i18nObject } from '$lib/i18n/i18n-util';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import type {
	OrganizationMember,
	OrganizationSession,
	UpgradeAwaiting
} from '$lib/organization/host';
import {
	fakeOrganizationMember,
	fakeOrganizationSession,
	fakeOrganizationWorkspace
} from '$lib/organization/tests/testing';
import type { GatedStep } from '$lib/organization/upgrade/upgrade';
import { BUILT_IN, EVERY_FLAG, maskOf } from '@rentable/workspace-permission';
import Providers from '#tests/providers.svelte';
import GateHarness from './gate-harness.svelte';

/**
 * A CAPABILITY WAITS FOR ITS UPGRADE, SAYING WHY AND WHO CAN RUN IT
 *
 * Ticket 08 of [[efforts/857-updating-never-locks-a-member-out/spec]], requirement 1 and criterion
 * 1: a capability gated on an upgrade step with `useUpgraded(step)` answers from what waits on the
 * data the step is on. Until the step has run it is offered, dimmed and refused, with the reason
 * it is unavailable and who can upgrade, never hidden; once the step has run, by anybody, it is
 * available on this machine.
 *
 * **What waits is the mock**, held in a rune as the shell's answer is held in the query cache, so a
 * run elsewhere that reads it again is a change of the rune.
 */

const reads: {
	awaiting: UpgradeAwaiting | undefined;
	session: OrganizationSession | null;
	members: OrganizationMember[] | undefined;
} = $state({ awaiting: undefined, session: null, members: undefined });

vi.mock('$lib/organization/upgrade/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/organization/upgrade/query')>()),
	useFetchUpgradeAwaiting: () => ({
		get data() {
			return reads.awaiting;
		}
	})
}));

vi.mock('$lib/organization/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/organization/query')>()),
	useFetchOrganizationState: () => ({
		get data() {
			return reads.session ? { session: reads.session } : undefined;
		}
	})
}));

vi.mock('$lib/organization/member/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/organization/member/query')>()),
	useFetchMembers: () => ({
		get data() {
			return reads.members;
		}
	})
}));

const NORTH = fakeOrganizationWorkspace({ id: 'north', name: 'North' });
const REFUNDS: GatedStep = { number: 8, target: { workspace: 'north' } };

const MEMBER = fakeOrganizationSession({
	memberId: 'member-sami',
	username: 'sami.staff',
	role: 'member',
	roleId: 'member',
	permissions: BUILT_IN.member.mask,
	workspaces: [NORTH]
});

const MEMBERS = [
	fakeOrganizationMember({
		id: 'member-owner',
		username: 'olivia.owner',
		role: 'owner',
		permissions: maskOf(...EVERY_FLAG)
	}),
	fakeOrganizationMember({
		id: 'member-ada',
		username: 'ada.lead',
		role: 'manager',
		permissions: BUILT_IN.manager.mask
	}),
	fakeOrganizationMember({ id: 'member-sami', username: 'sami.staff' })
];

const waiting = (needsOwner = false): UpgradeAwaiting => ({
	organization: [],
	workspaces: { north: [{ number: 8, needsOwner }] }
});

let created: number;

beforeEach(() => {
	document.body.innerHTML = '';
	created = 0;
	reads.awaiting = waiting();
	reads.session = MEMBER;
	reads.members = MEMBERS;
	loadLocale('en');
	setLocale('en');
});

const gated = (step: GatedStep = REFUNDS, direction: 'ltr' | 'rtl' = 'ltr') =>
	render(
		GateHarness,
		{ step, onCreate: () => (created += 1) },
		{ wrapper: Providers, wrapperProps: { strings, direction } }
	);

const control = () => document.querySelector<HTMLButtonElement>('[data-gated-control]')!;
const reason = () => {
	const id = control().getAttribute('aria-describedby');

	return id ? document.getElementById(id)?.textContent?.trim() : undefined;
};

test('until the step has run, the control is shown refused with why and who can upgrade, then runs once it has', async () => {
	gated();

	const t = i18nObject('en');

	expect(document.querySelector('[data-gated]')?.getAttribute('data-gated')).toBe('waiting');
	expect(control()).not.toBeNull();
	expect(control().getAttribute('aria-disabled')).toBe('true');
	expect(reason()).toBe(
		`${t.organization.upgrade.gate.needsWorkspace({ workspace: 'North' })} ${t.organization.upgrade.gate.theyCan({ who: 'olivia.owner or ada.lead' })}`
	);

	await fireEvent.click(control());
	expect(created).toBe(0);

	// somebody holding the permission runs the upgrade; what waits is read again and the step is
	// gone from it.
	reads.awaiting = { organization: [], workspaces: { north: [] } };
	flushSync();

	expect(document.querySelector('[data-gated]')?.getAttribute('data-gated')).toBe('upgraded');
	expect(control().getAttribute('aria-disabled')).toBeNull();
	expect(reason()).toBeUndefined();

	await fireEvent.click(control());
	expect(created).toBe(1);
});

test("a step needing the owner's key names the owner", () => {
	reads.awaiting = waiting(true);
	gated();

	const t = i18nObject('en');

	expect(reason()).toBe(
		`${t.organization.upgrade.gate.needsWorkspace({ workspace: 'North' })} ${t.organization.upgrade.gate.ownerCan({ owner: 'olivia.owner' })}`
	);
});

test('a reader who may run it is told they can, and the organization is named as such', () => {
	reads.session = fakeOrganizationSession({
		role: 'manager',
		roleId: 'manager',
		permissions: BUILT_IN.manager.mask
	});
	reads.awaiting = { organization: [{ number: 4, needsOwner: false }], workspaces: {} };
	gated({ number: 4, target: 'organization' });

	const t = i18nObject('en');

	expect(reason()).toBe(
		`${t.organization.upgrade.gate.needsOrganization()} ${t.organization.upgrade.gate.youCan()}`
	);
});

test('before the members are read, it names who carries the permission by default', () => {
	reads.members = undefined;
	gated();

	expect(reason()).toContain(i18nObject('en').organization.upgrade.gate.someoneCan());
});

test('while what waits is not known yet, the capability waits too', () => {
	reads.awaiting = undefined;
	gated();

	expect(control().getAttribute('aria-disabled')).toBe('true');
});

test('a step that is not waiting, or one on another workspace, runs', () => {
	gated({ number: 9, target: { workspace: 'north' } });
	expect(control().getAttribute('aria-disabled')).toBeNull();

	document.body.innerHTML = '';
	gated({ number: 8, target: { workspace: 'south' } });
	expect(control().getAttribute('aria-disabled')).toBeNull();
});

test('and in arabic', () => {
	loadLocale('ar');
	setLocale('ar');
	gated(REFUNDS, 'rtl');

	expect(reason()).toBe(
		`${ar.organization.upgrade.gate.needsWorkspace.replace('{workspace}', 'North')} ${ar.organization.upgrade.gate.theyCan.replace('{who}', 'olivia.owner أو ada.lead')}`
	);
});
