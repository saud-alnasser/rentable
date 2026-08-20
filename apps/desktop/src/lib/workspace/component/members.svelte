<script lang="ts">
	import type { RemoteSyncAccount } from '$lib/platform/host';
	import * as Avatar from '$lib/design/primitive/avatar';
	import { Badge } from '$lib/design/primitive/badge';
	import { Button } from '$lib/design/primitive/button';
	import * as Field from '$lib/design/primitive/field';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { accountInitials } from '$lib/sync/account';
	import LockIcon from '@lucide/svelte/icons/lock';
	import UserPlusIcon from '@lucide/svelte/icons/user-plus';

	/**
	 * Who is in this workspace.
	 *
	 * **One person, and the page says so rather than implying it.** The control plane has a
	 * `membership` table with roles and administration permission flags, and no route that reads
	 * it, so what this can name is the account this machine is signed in as. That account is the
	 * workspace's owner, because an account owns exactly one workspace and is created with it
	 * ([[efforts/a-workspace-follows-its-user]], requirement 6).
	 *
	 * **So this is not a list that happens to have one row: it is the only row this machine can
	 * know about.** The line under it says that, because a members list that quietly shows one
	 * person is indistinguishable from a workspace somebody was removed from.
	 *
	 * Inviting is offered and inert, following the create-workspace row: reachable, announced, and
	 * saying why in text rather than in a tooltip.
	 */
	let { account }: { account: RemoteSyncAccount } = $props();

	const initials = $derived(accountInitials(account.displayName || account.email));
</script>

<div class="space-y-4">
	<Field.Field orientation="responsive">
		<Field.Content>
			<div class="flex min-w-0 items-center gap-3">
				<Avatar.Root class="size-10 shrink-0 rounded-full">
					{#if account.avatarImage}
						<Avatar.Image src={account.avatarImage} alt={account.displayName} />
					{/if}
					<Avatar.Fallback class="rounded-full text-xs">{initials}</Avatar.Fallback>
				</Avatar.Root>
				<div class="grid min-w-0 gap-1">
					<div class="flex min-w-0 flex-wrap items-center gap-2">
						<p class="truncate text-sm font-medium">{account.displayName}</p>
						<Badge variant="secondary">{$LL.workspace.roleOwner()}</Badge>
					</div>
					<p class="truncate text-sm text-muted-foreground" dir="ltr">{account.email}</p>
				</div>
			</div>
		</Field.Content>

		<!-- a button, and not `disabled`: see `identity.svelte` for why the one attribute that would
		     make this simplest is the one it must not have. -->
		<Button
			variant="outline"
			size="sm"
			class="shrink-0"
			aria-disabled="true"
			onclick={(event) => event.preventDefault()}
		>
			<UserPlusIcon class="size-4 shrink-0" />
			{$LL.workspace.inviteLocked()}
			<LockIcon class="size-3.5 shrink-0" />
		</Button>
	</Field.Field>

	<Field.Description>{$LL.workspace.membersDescription()}</Field.Description>
</div>
