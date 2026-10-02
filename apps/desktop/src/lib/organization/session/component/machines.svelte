<script lang="ts">
	import type { MachineView } from '$lib/organization/host';
	import ConfirmDialog from '@rentable/design/block/confirm-dialog.svelte';
	import SettingsGroup from '@rentable/design/block/settings-group.svelte';
	import SettingsRow, { type SettingsRowMenu } from '@rentable/design/block/settings-row.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import { tone } from '@rentable/design/tone.js';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import {
		DAY,
		formatLocaleDate,
		formatLocaleRelativeTime,
		getIntlLocale
	} from '$lib/platform/locale';
	import LaptopIcon from '@lucide/svelte/icons/laptop';
	import LaptopMinimalIcon from '@lucide/svelte/icons/laptop-minimal';
	import LogOutIcon from '@lucide/svelte/icons/log-out';

	/**
	 * The reader's machines, from the account section (effort 846, requirements 9 to 11).
	 *
	 * **A card across both columns, a row per machine signed in as the reader** (effort 846,
	 * *Everything in a tab is a card*): the header says how many are signed in, and each row is
	 * this one first, marked by a badge beside its name, then the one most lately seen, with when
	 * it was last seen and when it was added on the line under its name, the way Google lists the
	 * devices on an account, Apple the devices on an Apple Account and GitHub a passkey used from
	 * this device. A machine that has not named itself reads as *a machine added* on its date,
	 * never as its id. The list never folds: the machine last seen a month ago is the one a reader
	 * most needs to find.
	 *
	 * **Each other machine is signed out from its row's menu**, and every machine but this one at
	 * the group's foot, which is the card's one act in the error tone, last (requirement 2). The
	 * menu is the settings row's own, the record menu a record card draws, as the components
	 * context's *a secondary act on a row of a growing list* names it: the quiet ellipsis control,
	 * named for the machine, holding *sign out*; the row draws it from the acts handed to it. *Until
	 * 2026-10-02 each row carried its own error-tone sign-out button, so the card held a red act
	 * on every row as well as the one at its foot; the human decided at converge that the one-machine
	 * sign-out moves off the row ("Move it off the rows").* This machine carries no menu here: the
	 * section's last group is its sign-out. A machine that has not run this version would not read
	 * a sign-out of its own, so its entry is shown refused with the reason, which names the act at
	 * the foot that does reach it ([[rules/interface]], *An act that cannot run says why at the
	 * control*).
	 *
	 * **Both ask once before they run**, naming the machines they end, because each reaches another
	 * machine and nobody there can take it back but by signing in again. The question is the
	 * confirm dialog named for the act ([[rules/interface]], *Delete and confirm*). What either
	 * says after it ran, sent or waiting on a connection, is its mutation's announcement.
	 */
	let {
		machines,
		onEndMachine,
		onEndOtherSessions
	}: {
		/** the reader's machines, this one first, as `organization.session.machines` lists them. */
		machines: MachineView[];
		/** sign one machine out; rejects with what the shared handler has said. */
		onEndMachine: (machineId: string) => Promise<void>;
		/** sign every other machine out; rejects with what the shared handler has said. */
		onEndOtherSessions: () => Promise<void>;
	} = $props();

	// the clock the last-seen moment is read against, moved once a minute, the finest unit it says.
	let now = $state(Date.now());

	$effect(() => {
		const tick = window.setInterval(() => {
			now = Date.now();
		}, 60_000);

		return () => window.clearInterval(tick);
	});

	const dateOf = (moment: number) => formatLocaleDate($locale, moment, { dateStyle: 'medium' });

	/** what a machine is called: its own name, or the fallback with the day it was added. */
	const nameOf = (machine: MachineView) =>
		machine.name ?? $LL.settings.you.machines.unnamed({ date: dateOf(machine.createdAt) });

	/** when it was last seen: relative within a day, as the sync group's last reach is, then a date. */
	const lastSeenOf = (machine: MachineView) =>
		$LL.settings.you.machines.lastSeen({
			moment:
				now - machine.seenAt < DAY
					? formatLocaleRelativeTime($locale, machine.seenAt, now)
					: dateOf(machine.seenAt)
		});

	const others = $derived(machines.filter((machine) => !machine.isThisMachine));

	/** the other machines' names, as one list in the reader's language, for the confirmation. */
	const othersNamed = $derived(
		others.length > 0
			? new Intl.ListFormat(getIntlLocale($locale), { type: 'conjunction' }).format(
					others.map(nameOf)
				)
			: undefined
	);

	/** the machine whose sign-out is being asked about, or `null` while nothing is. */
	let ending = $state<MachineView | null>(null);
	let endingOthers = $state(false);

	/**
	 * A machine's menu: its sign-out, refused with the reason where the machine has not run this
	 * version. Not in the error tone: the card's one error-tone act is signing every other machine
	 * out, last (requirement 2). This machine has none; the section's last group is its sign-out.
	 */
	const menuOf = (machine: MachineView, name: string): SettingsRowMenu | undefined =>
		machine.isThisMachine
			? undefined
			: {
					label: $LL.settings.you.machines.menu({ machine: name }),
					attributes: { 'data-machine-menu': machine.id },
					acts: [
						{
							label: $LL.common.actions.signOut(),
							icon: LogOutIcon,
							unavailable: machine.mayEndAlone
								? undefined
								: $LL.common.refusals.host.machineNotUpdated(),
							attributes: { 'data-end-machine': machine.id },
							onSelect: () => {
								ending = machine;
							}
						}
					]
				};

	const errorText = tone({ tone: 'error' }).text();
	const errorButton = `${errorText} hover:bg-destructive/10 hover:text-destructive`;
</script>

<div data-machines class="contents">
	<SettingsGroup
		icon={LaptopMinimalIcon}
		title={$LL.settings.you.machines.title()}
		description={$LL.settings.you.machines.description()}
		value={machines.length > 0
			? $LL.settings.you.machines.signedIn({ count: machines.length })
			: undefined}
		span="full"
	>
		{#snippet rows()}
			{#each machines as machine (machine.id)}
				{@const name = nameOf(machine)}
				<SettingsRow
					icon={LaptopIcon}
					{name}
					badge={machine.isThisMachine ? $LL.settings.you.machines.thisMachine() : undefined}
					menu={menuOf(machine, name)}
				>
					{#snippet meta()}
						<!-- the facts under the name, as every account page the research read puts
						     them: when it was seen and added, and, for a row that cannot be signed out
						     alone, that it has not run this version, as well as at its act. -->
						<span data-machine data-this-machine={machine.isThisMachine ? '' : undefined}>
							{#if !machine.isThisMachine && !machine.mayEndAlone}
								<span data-not-updated>{$LL.settings.you.machines.notUpdated()}</span> ·
							{/if}
							{lastSeenOf(machine)} · {$LL.settings.you.machines.added({
								date: dateOf(machine.createdAt)
							})}
						</span>
					{/snippet}
				</SettingsRow>
			{/each}
		{/snippet}
		{#snippet end()}
			<SettingsRow icon={LogOutIcon} name={$LL.settings.you.sessions.action()} tone="error">
				{#snippet control({ labelId })}
					<!-- labelled by the row's name, which holds the act's whole word, so the sign-outs in
					     one section are told apart by what they end. -->
					<Button
						type="button"
						variant="ghost"
						size="sm"
						class={errorButton}
						aria-labelledby={labelId}
						data-end-other-sessions-open
						onclick={() => {
							endingOthers = true;
						}}
					>
						<LogOutIcon class="size-4" />
						{$LL.common.actions.signOut()}
					</Button>
				{/snippet}
			</SettingsRow>
		{/snippet}
	</SettingsGroup>
</div>

<ConfirmDialog
	open={ending !== null}
	onOpenChange={(open) => {
		if (!open) ending = null;
	}}
	onSubmit={() => (ending ? onEndMachine(ending.id) : undefined)}
	record={ending ? nameOf(ending) : undefined}
	title={$LL.settings.you.machines.confirmTitle()}
	description={$LL.settings.you.machines.confirmDescription()}
	confirmLabel={$LL.common.actions.signOut()}
	confirmLoadingLabel={$LL.common.actions.working()}
/>

<ConfirmDialog
	open={endingOthers}
	onOpenChange={(open) => {
		endingOthers = open;
	}}
	onSubmit={onEndOtherSessions}
	record={othersNamed}
	title={$LL.settings.you.sessions.action()}
	description={$LL.settings.you.sessions.confirmDescription()}
	confirmLabel={$LL.common.actions.signOut()}
	confirmLoadingLabel={$LL.common.actions.working()}
/>
