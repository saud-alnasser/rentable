<script lang="ts">
	import FormSurface from '@rentable/design/block/form-surface.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import { composeReminderMessage, type ContractReminder } from '$lib/contract/reminder';
	import LanguageChoice from '$lib/design/block/language-choice.svelte';
	import MessageCircleIcon from '@lucide/svelte/icons/message-circle';
	import { LL } from '$lib/i18n/i18n-svelte';
	import type { Locales } from '$lib/i18n/i18n-types';
	import { i18nObject } from '$lib/i18n/i18n-util';
	import type { Action } from 'svelte/action';

	/**
	 * A reminder, shown before it goes to WhatsApp.
	 *
	 * The message is written for the tenant, who may read the other language, so it is shown first
	 * with the language it is written in, opening on the application's own (effort 835, requirement
	 * 12, revised), and one act, *open WhatsApp*, sends it there. The landlord still reads it and
	 * sends it from WhatsApp; nothing here sends or records anything.
	 */
	let {
		open,
		onOpenChange,
		reminder,
		locale = $bindable(),
		onSend
	}: {
		open: boolean;
		onOpenChange: (value: boolean) => void;
		reminder: ContractReminder;
		/** the language the message is written in. */
		locale: Locales;
		/** open WhatsApp with this message. */
		onSend: (message: string) => void;
	} = $props();

	const message = $derived(composeReminderMessage(reminder, i18nObject(locale), locale));

	// *open WhatsApp* is the panel's one act, so it is what the form submits.
	const enhance: Action<HTMLFormElement> = (form) => {
		const submit = (event: SubmitEvent) => {
			event.preventDefault();
			onSend(message);
		};

		form.addEventListener('submit', submit);

		return { destroy: () => form.removeEventListener('submit', submit) };
	};
</script>

<FormSurface {open} {onOpenChange} {enhance} weight="light" title={$LL.common.actions.remind()}>
	<div class="flex flex-col gap-4">
		<LanguageChoice bind:value={locale} label={$LL.contracts.reminder.language()} />

		<div class="flex flex-col gap-1">
			<p class="font-medium"><bdi>{reminder.tenantName ?? ''}</bdi></p>
			<p class="text-sm text-muted-foreground tabular-nums" dir="ltr">
				{reminder.tenantPhone ?? ''}
			</p>
		</div>

		<!-- the message as the tenant will read it, in its own language and direction. -->
		<p
			lang={locale}
			dir={locale === 'ar' ? 'rtl' : 'ltr'}
			class="rounded-2xl rounded-ss-sm bg-muted px-4 py-3 whitespace-pre-wrap"
			data-reminder-message
		>
			{message}
		</p>
	</div>

	{#snippet actions()}
		<Button type="submit" data-reminder-send>
			<MessageCircleIcon class="size-4" />
			<span class="first-letter:uppercase">{$LL.contracts.reminder.open()}</span>
		</Button>
	{/snippet}
</FormSurface>
