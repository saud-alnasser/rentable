<script lang="ts">
	import type { RemoteSyncState } from '$lib/platform/host';
	import * as Avatar from '$lib/design/primitive/avatar';
	import { Button } from '$lib/design/primitive/button';
	import * as Field from '$lib/design/primitive/field';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { accountInitials, signedInAccount } from '$lib/sync/account';
	import { signOutOfGoogle } from '$lib/sync/sign-in';
	import { toErrorText } from '$lib/error/message';
	import { toast } from 'svelte-sonner';
	import LogOutIcon from '@lucide/svelte/icons/log-out';

	/**
	 * Who this machine is signed in as, and the way back out.
	 *
	 * **It moved out of the settings page on 2026-08-20 and out of the settings module with it.**
	 * The account is who the workspace belongs to rather than a preference about the application,
	 * and it now has a page of its own; a file named for the screen that happened to hold it first
	 * is the thing that made settings the door for identity as well as for preferences.
	 *
	 * The way back in is not here. Signing out raises the sign-in wall, and the wall owns signing
	 * in.
	 */
	let { syncState }: { syncState: RemoteSyncState } = $props();

	const account = $derived(signedInAccount(syncState));
	const initials = $derived(accountInitials(account?.displayName || account?.email));

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

{#if account}
	<Field.Field orientation="responsive">
		<Field.Content>
			<div class="flex min-w-0 items-center gap-3">
				<!-- the picture this machine holds, never Google's URL: it is fetched once at sign-in
				     so a row that is always on screen looks the same offline as online (#630). -->
				<Avatar.Root class="size-12 shrink-0 rounded-full">
					{#if account.avatarImage}
						<Avatar.Image src={account.avatarImage} alt={account.displayName} />
					{/if}
					<Avatar.Fallback class="rounded-full text-sm">{initials}</Avatar.Fallback>
				</Avatar.Root>
				<div class="grid min-w-0 gap-1">
					<p class="truncate text-sm font-medium">{account.displayName}</p>
					<!-- the address is the account's, not the reader's language: isolating it keeps an
					     ltr address from reordering the arabic around it. -->
					<p class="truncate text-sm text-muted-foreground" dir="ltr">{account.email}</p>
				</div>
			</div>
			<Field.Description>{$LL.settings.accountDescription()}</Field.Description>
		</Field.Content>
		<Button
			variant="outline"
			size="sm"
			onclick={() => void signOut()}
			disabled={isSigningOut}
			class="shrink-0"
		>
			<LogOutIcon class="size-4" />
			{isSigningOut ? $LL.common.actions.working() : $LL.common.actions.signOut()}
		</Button>
	</Field.Field>
{/if}
