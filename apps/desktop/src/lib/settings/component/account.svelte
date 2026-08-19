<script lang="ts">
	import type { RemoteSyncState } from '$lib/platform/host';
	import { Button } from '$lib/design/primitive/button';
	import * as Field from '$lib/design/primitive/field';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { signedInAccount, signOutOfGoogle } from '$lib/sync/sign-in';
	import { toErrorText } from '$lib/error/message';
	import { toast } from 'svelte-sonner';
	import LogOutIcon from '@lucide/svelte/icons/log-out';

	/**
	 * Who this machine is signed in as, and the way back out.
	 *
	 * **Its own group rather than a row under sync**, because it is not about Google Drive: the
	 * account is who the workspace belongs to, and it outlives the Drive surface beside it. It
	 * reads `signedInAccount` for the same reason — going through `workspace.accountId` would ask
	 * which folder is linked, which is a different question with a different answer.
	 *
	 * The way back in is not here. Signing out raises the sign-in wall, and the wall owns signing in.
	 */
	let { syncState }: { syncState: RemoteSyncState } = $props();

	const account = $derived(signedInAccount(syncState));

	let isSigningOut = $state(false);

	async function signOut() {
		if (isSigningOut) {
			return;
		}

		isSigningOut = true;

		try {
			// nothing is done with the state it answers with, and nothing should be: signing out
			// announces itself, and the layout is what answers — this screen is about to be behind
			// the wall it raises.
			await signOutOfGoogle();
		} catch (error) {
			toast.error(toErrorText(error, $LL, $LL.common.errors.internal()));
		} finally {
			isSigningOut = false;
		}
	}
</script>

<Field.Field orientation="responsive">
	<Field.Content>
		<Field.Description>{$LL.settings.accountDescription()}</Field.Description>
		{#if account}
			<p class="text-sm font-medium">
				{$LL.settings.accountSignedInAs()}
				<!-- the address is the account's, not the reader's language: isolating it keeps an
				     ltr address from reordering the arabic around it. -->
				<span dir="ltr">{account.email}</span>
			</p>
		{/if}
	</Field.Content>
	<Button
		variant="outline"
		size="sm"
		onclick={() => void signOut()}
		disabled={isSigningOut || !account}
		class="shrink-0"
	>
		<LogOutIcon class="size-4" />
		{isSigningOut ? $LL.common.actions.working() : $LL.common.actions.signOut()}
	</Button>
</Field.Field>
