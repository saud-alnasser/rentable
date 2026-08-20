<script lang="ts">
	import { isConfirmable, toConfirmation, type Blockers } from '$lib/design/confirmation';
	import type { ButtonVariant } from '$lib/design/primitive/button';
	import { Button } from '$lib/design/primitive/button';
	import { Callout } from '$lib/design/primitive/callout';
	import * as Dialog from '$lib/design/primitive/dialog';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { TRPCError } from '@trpc/server';

	/**
	 * The one surface that asks before something is destroyed, shared by every action that does.
	 *
	 * It is built the way _Semantics are secondary_ (62) builds a confirmation: the action names
	 * the dialog, the record it acts on leads the sentence below, and the destructive control is
	 * the primary one — solid and high contrast — because a destructive action is primary here
	 * and nowhere else. Leaving is the tertiary control beside it, and the corner close the
	 * dialog already carries.
	 *
	 * Where something blocks the action there is no destructive control at all. The answer to the
	 * question is that it cannot be done, not that it might fail, and a control that would be
	 * refused is not an answer.
	 */
	let {
		open,
		onOpenChange,
		onSubmit,
		record,
		blockers,
		title = $LL.common.actions.delete(),
		description = $LL.common.deleteDialog.description(),
		confirmLabel = $LL.common.actions.delete(),
		confirmLoadingLabel = $LL.common.actions.deleting(),
		confirmVariant = 'destructive'
	}: {
		open: boolean;
		onOpenChange: (value: boolean) => void;
		onSubmit: () => Promise<void> | void;
		/** the record being acted on, named as the surface names it. */
		record?: string;
		/**
		 * What depends on the record and stops it being acted on, in the reader's words.
		 *
		 * The procedure refuses either way — this is what lets the dialog say so before
		 * offering anything destructive rather than after the control is pressed. A surface
		 * with nothing to read omits it; one that is still reading passes
		 * {@link AWAITING_BLOCKERS}.
		 */
		blockers?: Blockers;
		/** What is about to happen, as the dialog's own name. */
		title?: string;
		/** What it costs, under the record. Not shown where something blocks the action. */
		description?: string;
		confirmLabel?: string;
		confirmLoadingLabel?: string;
		confirmVariant?: ButtonVariant;
	} = $props();

	const confirmation = $derived(toConfirmation(blockers));
	const isBlocked = $derived(confirmation.state === 'blocked');

	let isSubmitting = $state(false);
	let error = $state<string | null>(null);

	async function submit() {
		isSubmitting = true;
		// a refusal describes the attempt that earned it, not the one starting now — leaving it
		// standing is what turned one refusal into a dialog that could never be pressed again.
		error = null;

		try {
			await onSubmit();
			onOpenChange(false);
		} catch (e) {
			const message =
				e instanceof Error && e.message ? e.message : $LL.common.messages.unexpectedError();

			if (e instanceof TRPCError && e.code === 'BAD_REQUEST') {
				error = message;
			}
		} finally {
			isSubmitting = false;
		}
	}

	$effect(() => {
		if (!open) {
			isSubmitting = false;
			error = null;
			return;
		}
	});
</script>

<Dialog.Root {open} {onOpenChange}>
	<Dialog.Content class="w-full max-w-md">
		<Dialog.Header>
			<Dialog.Title class="capitalize">{title}</Dialog.Title>
		</Dialog.Header>

		<div class="flex flex-col gap-4 px-6 py-5">
			<!-- the record leads, in the reader's own words for it: the question is about this one
			     and no other. What follows says what the action costs, or what stops it — on its own
			     line, because both sentences have a subject already and a name set in front of one
			     reads as that sentence's subject rather than as the record. -->
			<div class="space-y-1">
				<p class="text-sm leading-6 font-medium break-words">
					{record || $LL.common.deleteDialog.unnamedRecord()}
				</p>
				<p class="text-sm leading-6 text-muted-foreground">
					{isBlocked ? $LL.common.deleteDialog.blockedDescription() : description}
				</p>
			</div>

			{#if isBlocked}
				<ul class="flex flex-col gap-1 rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
					{#each confirmation.blocking as blocker (blocker)}
						<li class="flex items-start gap-2">
							<span class="mt-2 size-1.5 shrink-0 rounded-full bg-foreground/40" aria-hidden="true"
							></span>
							<span class="min-w-0">{blocker}</span>
						</li>
					{/each}
				</ul>
			{/if}

			{#if error}
				<Callout tone="error">
					{error}
				</Callout>
			{/if}
		</div>

		<Dialog.Footer>
			<!-- tertiary, because leaving costs nothing and the eye should land on the control that
			     does. Where the action is blocked it is the only control, and leads. -->
			<Button
				variant={isBlocked ? 'default' : 'ghost'}
				disabled={isSubmitting}
				onclick={() => onOpenChange(false)}
				class="w-full sm:w-auto"
			>
				{isBlocked ? $LL.common.ui.close() : $LL.common.actions.cancel()}
			</Button>

			{#if !isBlocked}
				<Button
					variant={confirmVariant}
					disabled={!isConfirmable(confirmation.state, isSubmitting)}
					onclick={submit}
					class="w-full sm:w-auto"
				>
					{#if isSubmitting}
						{confirmLoadingLabel}
					{:else}
						{confirmLabel}
					{/if}
				</Button>
			{/if}
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
