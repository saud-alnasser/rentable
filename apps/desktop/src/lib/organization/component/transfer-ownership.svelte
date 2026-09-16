<script lang="ts">
	import FormSurface, { insetControl } from '@rentable/design/block/form-surface.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import * as InputGroup from '@rentable/design/primitive/input-group/index.js';
	import * as Select from '@rentable/design/primitive/select/index.js';
	import { cn } from '@rentable/design/tailwind.js';
	import { onSubmit } from '$lib/design/form';
	import { LL } from '$lib/i18n/i18n-svelte';
	import CrownIcon from '@lucide/svelte/icons/crown';
	import KeyRoundIcon from '@lucide/svelte/icons/key-round';

	/**
	 * Handing the organization to somebody else (effort 828, requirement 22).
	 *
	 * **Heavy, on the shared form surface** ([[rules/interface]], *Form surface*). It is a write
	 * and it takes a password, so it takes the surface every other write takes; heavy because what
	 * a person has to read before they type is the whole of what changes, and the weight is
	 * declared rather than measured.
	 *
	 * **The body says the three things that change, in plain words**: the account they choose
	 * becomes the owner, they become an administrator, and the Turso account stays theirs. The
	 * third is the one nobody would guess: the authority is a token the person who consented
	 * holds, no row carries it, and the new owner reconnects it from their own sync section before
	 * the acts that mint are theirs. Saying it here is what keeps the sentence in the sync section
	 * from being the first anybody hears of it.
	 *
	 * **What it does not say is that the keys change, because they do not.** The organization's
	 * signing key is unchanged and nothing is re-signed; its seed is sealed into the new owner's
	 * vault. There is nothing in that for a person to act on, so it is in the code and not on the
	 * screen.
	 *
	 * **A refusal marks the password** ([[rules/interface]], *Validation errors*). The shell
	 * refuses a password that does not open the owner's vault, so that is the field it belongs to,
	 * and the surface stays open with the account still chosen.
	 *
	 * **The mutation is the caller's.** This owns the two fields and hands the pair up through
	 * `onTransfer`; the section closes it on a transfer that went through and hands back the
	 * sentence on one that did not.
	 */
	let {
		open,
		onOpenChange,
		accounts,
		isTransferring,
		errorMessage,
		onTransfer
	}: {
		open: boolean;
		onOpenChange: (value: boolean) => void;
		/** every account that could be given the organization: everybody but the owner's own row. */
		accounts: { id: string; username: string }[];
		/** the transfer is running, which is a moment a person is waiting on. */
		isTransferring: boolean;
		/** what the shell refused the last attempt with, marked on the password. */
		errorMessage: string | null;
		onTransfer: (memberId: string, password: string) => void;
	} = $props();

	let chosen = $state('');
	let password = $state('');

	// nothing typed here outlives the surface: a password left in memory with nothing drawing it
	// is the one value this must not keep.
	$effect(() => {
		if (!open) {
			chosen = '';
			password = '';
		}
	});

	const usernameOf = (id: string) => accounts.find((account) => account.id === id)?.username ?? '';

	const canSubmit = $derived(chosen !== '' && password.length > 0 && !isTransferring);

	const enhance = onSubmit(() => {
		if (canSubmit) onTransfer(chosen, password);
	});
</script>

<FormSurface
	{open}
	{onOpenChange}
	{enhance}
	weight="heavy"
	title={$LL.organization.dashboard.transferOwnership()}
>
	<div class="flex flex-col gap-4" data-transfer-ownership-form>
		<p class="text-sm text-muted-foreground" data-transfer-ownership-goes>
			{$LL.organization.dashboard.transferOwnershipGoes()}
		</p>

		<!-- the Turso account is the half of this a person would not guess, so it stands on its own
		     line rather than inside the paragraph above. -->
		<p class="text-sm text-muted-foreground" data-transfer-ownership-authority>
			{$LL.organization.dashboard.transferOwnershipAuthority()}
		</p>

		<!-- how many accounts the organization could go to is what this section is read by: the
		     chooser's own list is drawn in a portal on opening, which a test cannot reach. -->
		<Field.Field data-transfer-ownership-accounts={accounts.length}>
			<Field.Label for="transfer-ownership-account">
				{$LL.organization.dashboard.transferOwnershipAccount()}
			</Field.Label>
			<Select.Root
				type="single"
				value={chosen}
				onValueChange={(value) => {
					chosen = value;
				}}
				disabled={isTransferring}
			>
				<Select.Trigger id="transfer-ownership-account" class={cn('w-full', insetControl)}>
					{usernameOf(chosen)}
				</Select.Trigger>
				<Select.Content>
					{#each accounts as account (account.id)}
						<Select.Item value={account.id} label={account.username}>
							{account.username}
						</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
		</Field.Field>

		<Field.Field>
			<Field.Label for="transfer-ownership-password">
				{$LL.organization.dashboard.transferOwnershipPassword()}
			</Field.Label>
			<InputGroup.Root class={insetControl} data-disabled={isTransferring ? 'true' : undefined}>
				<InputGroup.Addon>
					<KeyRoundIcon />
				</InputGroup.Addon>
				<InputGroup.Input
					id="transfer-ownership-password"
					name="password"
					type="password"
					autocomplete="current-password"
					bind:value={password}
					disabled={isTransferring}
					aria-invalid={errorMessage ? 'true' : undefined}
				/>
			</InputGroup.Root>
			{#if errorMessage}
				<Field.Error>{errorMessage}</Field.Error>
			{/if}
		</Field.Field>
	</div>

	{#snippet actions()}
		<Button
			type="button"
			variant="outline"
			disabled={isTransferring}
			onclick={() => onOpenChange(false)}
		>
			{$LL.common.actions.cancel()}
		</Button>
		<Button type="submit" disabled={!canSubmit}>
			<CrownIcon class="size-4" />
			{isTransferring
				? $LL.common.actions.working()
				: $LL.organization.dashboard.transferOwnershipConfirm()}
		</Button>
	{/snippet}
</FormSurface>
