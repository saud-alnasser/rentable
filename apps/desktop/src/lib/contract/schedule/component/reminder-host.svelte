<script lang="ts">
	import type { ContractActRecord } from '$lib/contract/acts';
	import { contractHostState } from '$lib/contract/host.svelte';
	import { useReadContractReminder } from '$lib/contract/schedule/query';
	import { toWhatsAppUrl, type ContractReminder } from '$lib/contract/schedule/reminder';
	import { showErrorToast } from '$lib/notification';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import type { Locales } from '$lib/i18n/i18n-types';
	import { tauri } from '$lib/platform/tauri';
	import { untrack } from 'svelte';
	import ReminderPreview from './reminder-preview.svelte';

	/**
	 * The reminder a contract's *remind tenant* act opens, answered once for the whole shell by the
	 * contract host that mounts it (`contract/component/host.svelte`): the request is raised on
	 * `contract/host.svelte.ts`, read here, and shown before WhatsApp opens with it written.
	 */

	const readReminder = useReadContractReminder();

	/** the reminder being shown before it goes to WhatsApp, and the language it is written in. */
	let reminder = $state.raw<ContractReminder | null>(null);
	let reminderOpen = $state(false);
	let reminderLocale = $state<Locales>('en');

	/**
	 * A reminder to the contract's tenant, shown first with its language, which opens on the
	 * application's own. The facts are read fresh, so the amount is today's.
	 */
	async function remind(contract: ContractActRecord) {
		try {
			reminder = await readReminder(contract.id);
			reminderLocale = $locale;
			reminderOpen = true;
		} catch (error) {
			showErrorToast(error, $LL);
		}
	}

	/**
	 * Open WhatsApp on a chat with the tenant, the message written. The landlord reads it and sends
	 * it there, and nothing here records that a reminder went.
	 */
	async function sendReminder(message: string) {
		if (!reminder?.tenantPhone) {
			return;
		}

		try {
			await tauri.opener.openUrl(toWhatsAppUrl(reminder.tenantPhone, message));
			reminderOpen = false;
		} catch (error) {
			showErrorToast(error, $LL);
		}
	}

	// the request is answered once and cleared first, as every request the contract host answers is.
	$effect(() => {
		const contract = contractHostState.reminding;

		if (!contract) {
			return;
		}

		contractHostState.reminding = null;
		untrack(() => void remind(contract));
	});
</script>

{#if reminder}
	<ReminderPreview
		open={reminderOpen}
		onOpenChange={(isOpen) => {
			if (!isOpen) reminderOpen = false;
		}}
		{reminder}
		bind:locale={reminderLocale}
		onSend={(message) => void sendReminder(message)}
	/>
{/if}
