<script lang="ts">
	import PageFrame from '@rentable/design/block/page-frame.svelte';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { Separator } from '@rentable/design/primitive/separator/index.js';
	import OrganizationChangePasswordForm from '$lib/organization/component/change-password-form.svelte';
	import { useChangePassword } from '$lib/organization/query';
	import { useFetchRemoteSyncState } from '$lib/settings/query';
	import SyncAccount from '$lib/sync/component/account.svelte';

	/**
	 * The person, as a page of its own.
	 *
	 * **One group, and that is not a page waiting to be filled.** Who this machine is signed in as
	 * and the way back out is the whole of what this application knows about a person: the name,
	 * the address and the picture are Google's, and there is nothing here to change. It is a page
	 * rather than a row on the settings page because it answers a different question, and because
	 * the account control in the sidebar needed somewhere to send a reader that was not the
	 * application's preferences.
	 *
	 * No loading branch: the shell renders past admission, and the startup path primes this
	 * query's key before it mounts. See `/workspace` for the same note at length.
	 */
	const remoteSyncQuery = useFetchRemoteSyncState();
	const changePassword = useChangePassword();

	const syncState = $derived(remoteSyncQuery.data);

	let form = $state<{ reset: () => void } | null>(null);

	/**
	 * the one thing about a person this application does hold, changed here. The refusal a person
	 * can act on is said by the shared handler; a change that went through empties the form,
	 * because the two values in it are the ones that must not be left on screen.
	 */
	const change = async (current: string, next: string) => {
		try {
			await changePassword.mutateAsync({ current, next });
			form?.reset();
		} catch {
			// said by the shared handler; the form keeps what was typed.
		}
	};
</script>

{#if syncState}
	<PageFrame>
		<h1 class="text-3xl font-semibold tracking-tight capitalize">{$LL.account.title()}</h1>

		<Field.Group>
			<Field.Set>
				<Field.Legend>{$LL.account.groupIdentity()}</Field.Legend>
				<SyncAccount {syncState} />
			</Field.Set>

			<Separator />

			<Field.Set>
				<Field.Legend>{$LL.account.password.title()}</Field.Legend>
				<Field.Description>{$LL.account.password.description()}</Field.Description>
				<OrganizationChangePasswordForm
					bind:this={form}
					currentLabel={$LL.account.password.currentLabel()}
					isChanging={changePassword.isPending}
					errorMessage={null}
					onChange={(current, next) => void change(current, next)}
				/>
			</Field.Set>
		</Field.Group>
	</PageFrame>
{/if}
