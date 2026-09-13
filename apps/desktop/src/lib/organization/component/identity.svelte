<script lang="ts">
	import type { OrganizationSession } from '$lib/platform/host';
	import * as Avatar from '@rentable/design/primitive/avatar/index.js';
	import { Badge } from '@rentable/design/primitive/badge/index.js';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { accountInitials } from '$lib/sync/account';
	import { requestSignOut } from '$lib/sync/sign-out';
	import LogOutIcon from '@lucide/svelte/icons/log-out';

	/**
	 * Who is in, and the way back out.
	 *
	 * The name, the address, the role and the organization are what the member's own row says,
	 * opened with the content key their vault holds; there is no picture, because nothing here
	 * ever asked a service for one. Signing out drops the keys this process holds and puts the
	 * wall back up; the organization stays listed on the sign-in screen, because the machine
	 * still knows which member it is there.
	 *
	 * *`sync/component/account.svelte` drew the Google account here until the control plane
	 * retired.*
	 */
	let { session }: { session: OrganizationSession } = $props();

	const roleLabel = (role: string) =>
		({
			owner: $LL.layout.signIn.roleOwner(),
			administrator: $LL.layout.signIn.roleAdministrator(),
			member: $LL.layout.signIn.roleMember()
		})[role] ?? role;
</script>

<Field.Field orientation="responsive" data-identity={session.memberId}>
	<Field.Content>
		<div class="flex min-w-0 items-center gap-3">
			<Avatar.Root class="size-10 shrink-0 rounded-full">
				<Avatar.Fallback class="rounded-full text-xs">
					{accountInitials(session.username || session.organizationName)}
				</Avatar.Fallback>
			</Avatar.Root>
			<div class="grid min-w-0 gap-1">
				<div class="flex min-w-0 flex-wrap items-center gap-2">
					<p class="truncate text-sm font-medium">
						{session.username || session.organizationName}
					</p>
					<Badge variant="secondary">{roleLabel(session.role)}</Badge>
				</div>
				<p class="truncate text-sm text-muted-foreground">{session.organizationName}</p>
			</div>
		</div>
	</Field.Content>

	<Button variant="outline" size="sm" class="shrink-0" onclick={requestSignOut}>
		<LogOutIcon class="size-4 shrink-0" />
		{$LL.common.actions.signOut()}
	</Button>
</Field.Field>
