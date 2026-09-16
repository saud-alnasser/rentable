<script lang="ts">
	import * as Dialog from '@rentable/design/primitive/dialog/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import {
		ADMINISTRATION_BY_ROLE,
		EVERY_ADMINISTRATION,
		permits,
		type Administration,
		type Role
	} from '@rentable/workspace-permission';
	import CheckIcon from '@lucide/svelte/icons/check';
	import MinusIcon from '@lucide/svelte/icons/minus';

	/**
	 * What each role may do, read and never edited.
	 *
	 * **The comparison belongs beside the chooser rather than inside it** (effort 828, requirement
	 * 23). Every product in
	 * [[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/evidence/research/how-products-present-roles-and-permissions]]
	 * that offers a role-by-act matrix offers it as documentation: the editing surface is a
	 * chooser of role names, and the matrix is what somebody consults before picking one. So this
	 * is opened from the members tray, by a control beside the add, and writes nothing.
	 *
	 * **It is one table with two groups, and the second is the point of it.** The seven acts a
	 * member can be given are what the sheet's own list hands out, and every one of them is an
	 * administrator's and an owner's from the moment they are created. What actually separates the
	 * two is the group below: creating and deleting a workspace, locking somebody out, renewing
	 * credentials and the Turso account itself all need the authority that lives on one machine
	 * and in no row, so they are refused in Rust by an owner check rather than stored as flags.
	 * A table that left them out would say the owner and the administrator are the same thing.
	 *
	 * **The rows are read from the package**, so an act added to `ADMINISTRATION` appears here
	 * with its sentence rather than being forgotten. The five below are not acts the package
	 * carries, because nothing can be granted them; they are named here and in `permission.rs`.
	 *
	 * **A mark is read as well as seen.** Each cell carries its own word for a screen reader,
	 * since a column of glyphs says nothing to one.
	 */
	let {
		open,
		onOpenChange
	}: {
		open: boolean;
		onOpenChange: (value: boolean) => void;
	} = $props();

	/** the three roles, as columns, weakest first: a reader scans towards what they are giving. */
	const ROLES: Role[] = ['member', 'administrator', 'owner'];

	const roleLabel = (role: Role) =>
		({
			owner: $LL.layout.signIn.roleOwner(),
			administrator: $LL.layout.signIn.roleAdministrator(),
			member: $LL.layout.signIn.roleMember()
		})[role];

	const roleWho = (role: Role) =>
		({
			owner: $LL.organization.roles.owner.who(),
			administrator: $LL.organization.roles.administrator.who(),
			member: $LL.organization.roles.member.who()
		})[role];

	const actDoes = (act: Administration) =>
		({
			inviteMember: $LL.organization.acts.inviteMember.does(),
			removeMember: $LL.organization.acts.removeMember.does(),
			changeRole: $LL.organization.acts.changeRole.does(),
			renameWorkspace: $LL.organization.acts.renameWorkspace.does(),
			resetPassword: $LL.organization.acts.resetPassword.does(),
			renameMember: $LL.organization.acts.renameMember.does(),
			grantWorkspace: $LL.organization.acts.grantWorkspace.does()
		})[act];

	/** the acts nobody can be given, and what each one is, in the order the sync section meets them. */
	const ownerAlone = $derived([
		{ name: 'createWorkspace', does: $LL.organization.roleTable.createWorkspace() },
		{ name: 'deleteWorkspace', does: $LL.organization.roleTable.deleteWorkspace() },
		{ name: 'lockOut', does: $LL.organization.roleTable.lockOut() },
		{ name: 'renew', does: $LL.organization.roleTable.renew() },
		{ name: 'tursoAccount', does: $LL.organization.roleTable.tursoAccount() }
	]);

	const carries = (role: Role, act: Administration) => permits(ADMINISTRATION_BY_ROLE[role], act);
</script>

{#snippet mark(yes: boolean)}
	<td class="px-2 py-2 text-center align-top">
		{#if yes}
			<CheckIcon class="mx-auto size-4" aria-hidden="true" />
		{:else}
			<MinusIcon class="mx-auto size-4 text-muted-foreground/60" aria-hidden="true" />
		{/if}
		<span class="sr-only">
			{yes ? $LL.organization.roleTable.allowed() : $LL.organization.roleTable.notAllowed()}
		</span>
	</td>
{/snippet}

<Dialog.Root bind:open={() => open, onOpenChange}>
	<Dialog.Content class="w-full sm:max-w-2xl">
		<Dialog.Header>
			<Dialog.Title class="capitalize">{$LL.organization.roleTable.title()}</Dialog.Title>
			<Dialog.Description>{$LL.organization.roleTable.description()}</Dialog.Description>
		</Dialog.Header>

		<!-- one scroll area, the dialog's own, the way every other dialog here composes it. -->
		<div class="flex min-h-0 flex-col gap-4 overflow-y-auto px-6 py-5">
			<!-- who each role is for, before what it may do: the sentence is what a person picks on,
		     and the matrix is what they check afterwards. -->
			<div class="flex flex-col gap-2" data-role-whos>
				{#each ROLES as role (role)}
					<div class="flex flex-col gap-0.5" data-role-who={role}>
						<span class="text-sm font-medium capitalize">{roleLabel(role)}</span>
						<span class="text-xs leading-snug text-muted-foreground">{roleWho(role)}</span>
					</div>
				{/each}
			</div>

			<table class="w-full border-collapse text-sm" data-role-table>
				<thead>
					<tr class="border-b border-border/60">
						<th class="w-1/2 px-2 py-2 text-start text-xs font-medium text-muted-foreground"></th>
						{#each ROLES as role (role)}
							<th
								class="px-2 py-2 text-center text-xs font-medium text-muted-foreground capitalize"
								data-role-column={role}
							>
								{roleLabel(role)}
							</th>
						{/each}
					</tr>
				</thead>

				<tbody>
					<tr>
						<th
							colspan={ROLES.length + 1}
							class="px-2 pt-4 pb-1 text-start text-xs font-medium capitalize"
							data-role-group="given"
						>
							{$LL.organization.roleTable.given()}
						</th>
					</tr>
					{#each EVERY_ADMINISTRATION as act (act)}
						<tr class="border-b border-border/40" data-role-act={act}>
							<td class="px-2 py-2 text-start leading-snug">{actDoes(act)}</td>
							{#each ROLES as role (role)}
								{@render mark(carries(role, act))}
							{/each}
						</tr>
					{/each}
					<tr>
						<td colspan={ROLES.length + 1} class="px-2 pt-2 text-xs text-muted-foreground">
							{$LL.organization.roleTable.memberNote()}
						</td>
					</tr>

					<tr>
						<th
							colspan={ROLES.length + 1}
							class="px-2 pt-6 pb-1 text-start text-xs font-medium capitalize"
							data-role-group="owner-alone"
						>
							{$LL.organization.roleTable.ownerAlone()}
						</th>
					</tr>
					{#each ownerAlone as act (act.name)}
						<tr class="border-b border-border/40" data-role-act={act.name}>
							<td class="px-2 py-2 text-start leading-snug">{act.does}</td>
							{#each ROLES as role (role)}
								{@render mark(role === 'owner')}
							{/each}
						</tr>
					{/each}
					<tr>
						<td colspan={ROLES.length + 1} class="px-2 pt-2 text-xs text-muted-foreground">
							<span data-role-owner-reason>{$LL.organization.roleTable.ownerAloneReason()}</span>
						</td>
					</tr>
				</tbody>
			</table>
		</div>
	</Dialog.Content>
</Dialog.Root>
