import { heldPermissions } from '$lib/api/context';
import type { Locales, TranslationFunctions } from '$lib/i18n/i18n-types';
import { getIntlLocale } from '$lib/platform/locale';
import { permits } from '@rentable/workspace-permission';

import type { OrganizationMember } from '../member/host';
import type { OrganizationSession } from '../host';
import type { AwaitingStep, UpgradeAwaiting, UpgradeTarget } from './host';

/**
 * THE UPGRADE, AS THE INTERFACE READS IT
 *
 * Effort 857, ticket 08 (requirements 1 and 3). What waits for the upgrade on the organization and
 * on each workspace, read off `organization.upgrade.awaiting`, decides two things: whether
 * settings marks a target as having an upgrade available, and whether a capability gated on one
 * step may run yet. Both are answered here from the same answer, so the mark and the gate cannot
 * disagree.
 */

/**
 * a capability's step: its number on its ladder, and the target it is on, the organization or one
 * workspace. A capability in a workspace names the workspace it stands in.
 */
export type GatedStep = { number: number; target: UpgradeTarget };

/** the steps waiting on `target`, or `undefined` while what waits is not known yet. */
export function awaitingOn(
	awaiting: UpgradeAwaiting | undefined,
	target: UpgradeTarget
): AwaitingStep[] | undefined {
	if (!awaiting) return undefined;

	return target === 'organization'
		? awaiting.organization
		: (awaiting.workspaces[target.workspace] ?? []);
}

/**
 * whether the step `step` has run on the data it is on: it is not among the steps waiting there.
 * **Not known is not upgraded**: until the answer arrives the capability waits, since letting it
 * run on data whose upgrade has not run is what the gate is for.
 */
export function isUpgraded(awaiting: UpgradeAwaiting | undefined, step: GatedStep): boolean {
	const waiting = awaitingOn(awaiting, step.target);

	return waiting !== undefined && !waiting.some(({ number }) => number === step.number);
}

/** whether the reader may run an upgrade at all: `upgradeData` on their row, unlocked. */
export function mayUpgrade(session: OrganizationSession | null): boolean {
	return session !== null && permits(heldPermissions(session), 'upgradeData');
}

/**
 * whether settings marks `target` for the reader: they may upgrade, and something waits there.
 * Somebody who may not run it is never offered it (spec requirement 3).
 */
export function isUpgradable(
	session: OrganizationSession | null,
	awaiting: UpgradeAwaiting | undefined,
	target: UpgradeTarget
): boolean {
	return mayUpgrade(session) && (awaitingOn(awaiting, target)?.length ?? 0) > 0;
}

/**
 * why a capability waiting on `step` cannot run, and who can run the upgrade it waits on, as one
 * sentence for its control (spec requirement 1: "offered with the reason it is unavailable and who
 * can upgrade"). `members` is the organization's list where it has been read; without it the
 * sentence names the roles that carry the permission by default.
 *
 * **Who** is, in order: the reader, where they may run it themselves; the owner by name, where the
 * step needs the owner's own key; and otherwise everybody whose permissions carry `upgradeData`,
 * by username, joined as the reader's language joins a choice.
 */
export function upgradeReason(
	t: TranslationFunctions,
	locale: Locales,
	{
		step,
		waiting,
		session,
		members
	}: {
		step: GatedStep;
		/** the step as it waits, which says whether it needs the owner; `undefined` where unknown. */
		waiting: AwaitingStep | undefined;
		session: OrganizationSession | null;
		members: OrganizationMember[] | undefined;
	}
): string {
	const target = step.target;
	const needs =
		target === 'organization'
			? t.organization.upgrade.gate.needsOrganization()
			: t.organization.upgrade.gate.needsWorkspace({
					workspace:
						session?.workspaces.find((workspace) => workspace.id === target.workspace)?.name ?? ''
				});

	return `${needs} ${whoCanUpgrade(t, locale, waiting?.needsOwner === true, session, members)}`;
}

/** who can run an upgrade, as the second half of `upgradeReason`'s sentence. */
function whoCanUpgrade(
	t: TranslationFunctions,
	locale: Locales,
	needsOwner: boolean,
	session: OrganizationSession | null,
	members: OrganizationMember[] | undefined
): string {
	const gate = t.organization.upgrade.gate;

	if (session && (needsOwner ? session.role === 'owner' : mayUpgrade(session))) {
		return gate.youCan();
	}

	if (needsOwner && session?.ownerUsername) {
		return gate.ownerCan({ owner: session.ownerUsername });
	}

	const holders = (members ?? [])
		// the owner always holds it, whatever their row's mask says (spec requirement 3).
		.filter((member) => member.role === 'owner' || permits(member.permissions, 'upgradeData'))
		.map((member) => member.username);

	if (needsOwner || holders.length === 0) {
		return gate.someoneCan();
	}

	return gate.theyCan({
		who: new Intl.ListFormat(getIntlLocale(locale), { type: 'disjunction' }).format(holders)
	});
}
