<script lang="ts">
	import type { Invited, OrganizationWorkspace } from '$lib/platform/tauri';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import { Callout } from '@rentable/design/primitive/callout/index.js';
	import { Checkbox } from '@rentable/design/primitive/checkbox/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import { Input } from '@rentable/design/primitive/input/index.js';
	import * as Select from '@rentable/design/primitive/select/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import CopyIcon from '@lucide/svelte/icons/copy';

	/**
	 * Inviting a member: an address, a name, a role, the workspaces they belong to.
	 *
	 * **What comes back is shown once, and the form says it cannot send it.** The application has
	 * registered with no mail service and the spec forbids registering one on the customer's
	 * behalf, so the link and the generated password are handed over by the person who invited,
	 * and the two copy controls are what a person needs to do that. The password is on screen for
	 * as long as this panel is, and nowhere afterwards.
	 *
	 * **Inviting an administrator is the owner's**, because certifying one needs the organization
	 * key; the role select offers it only to the owner, and the shell refuses it regardless.
	 */
	let {
		workspaces,
		canInviteAdministrators,
		isInviting,
		invited,
		copied,
		onInvite,
		onCopy,
		onDismiss
	}: {
		/** the workspaces the inviter can grant, which is what they hold themselves. */
		workspaces: OrganizationWorkspace[];
		canInviteAdministrators: boolean;
		isInviting: boolean;
		/** what the last invitation made, shown until dismissed. */
		invited: Invited | null;
		/** which of the two was last copied, for the control to say so. */
		copied: 'link' | 'password' | null;
		onInvite: (
			email: string,
			displayName: string,
			role: 'administrator' | 'member',
			workspaceIds: string[]
		) => void;
		onCopy: (what: 'link' | 'password', value: string) => void;
		onDismiss: () => void;
	} = $props();

	let email = $state('');
	let displayName = $state('');
	let role = $state<'administrator' | 'member'>('member');
	let chosen = $state<string[]>([]);

	const canSubmit = $derived(
		email.trim().includes('@') && displayName.trim().length > 0 && !isInviting
	);

	const roleLabel = (value: string) =>
		({
			administrator: $LL.layout.signIn.roleAdministrator(),
			member: $LL.layout.signIn.roleMember()
		})[value] ?? value;

	const toggle = (id: string, checked: boolean) => {
		chosen = checked ? [...new Set([...chosen, id])] : chosen.filter((held) => held !== id);
	};

	const submit = () => {
		if (!canSubmit) return;

		onInvite(email.trim(), displayName.trim(), role, chosen);
	};

	const reset = () => {
		email = '';
		displayName = '';
		role = 'member';
		chosen = [];
		onDismiss();
	};
</script>

{#if invited}
	<div class="space-y-4" data-invited>
		<!-- the one notice this surface carries, because it is the one thing a person has to act on:
		     nothing was sent, and the two things below are theirs to send. -->
		<Callout tone="warning">{$LL.organization.dashboard.cannotSend()}</Callout>

		<div class="space-y-2">
			<p class="text-sm font-medium">{$LL.organization.setup.linkLabel()}</p>
			<!-- machine strings, read left to right in both locales ([[rules/frontend]], *i18n*). -->
			<code
				dir="ltr"
				class="block overflow-x-auto rounded-md bg-muted px-3 py-2 text-xs break-all select-all"
				data-invited-link>{invited.joinLink}</code
			>
			<Button variant="outline" size="sm" onclick={() => onCopy('link', invited.joinLink)}>
				<CopyIcon class="size-4" />
				{copied === 'link'
					? $LL.organization.setup.linkCopied()
					: $LL.organization.setup.copyLink()}
			</Button>
		</div>

		<div class="space-y-2">
			<p class="text-sm font-medium">{$LL.organization.dashboard.generatedPassword()}</p>
			<code
				dir="ltr"
				class="block rounded-md bg-muted px-3 py-2 font-mono text-sm select-all"
				data-invited-password>{invited.generatedPassword}</code
			>
			<p class="text-sm text-muted-foreground">
				{$LL.organization.dashboard.passwordOnce()}
			</p>
			<Button
				variant="outline"
				size="sm"
				onclick={() => onCopy('password', invited.generatedPassword)}
			>
				<CopyIcon class="size-4" />
				{copied === 'password'
					? $LL.organization.dashboard.passwordCopied()
					: $LL.organization.dashboard.copyPassword()}
			</Button>
		</div>

		<Button onclick={reset}>{$LL.organization.dashboard.done()}</Button>
	</div>
{:else}
	<form
		class="space-y-4"
		data-invite-form
		onsubmit={(event) => {
			event.preventDefault();
			submit();
		}}
	>
		<Field.Field>
			<Field.Label for="invite-email">{$LL.organization.dashboard.email()}</Field.Label>
			<Input
				id="invite-email"
				name="email"
				type="email"
				autocomplete="off"
				bind:value={email}
				disabled={isInviting}
			/>
		</Field.Field>

		<Field.Field>
			<Field.Label for="invite-name">{$LL.common.labels.name()}</Field.Label>
			<Input
				id="invite-name"
				name="displayName"
				autocomplete="off"
				bind:value={displayName}
				disabled={isInviting}
			/>
		</Field.Field>

		<Field.Field>
			<Field.Label for="invite-role">{$LL.organization.dashboard.role()}</Field.Label>
			<Select.Root
				type="single"
				value={role}
				onValueChange={(value) => {
					if (value === 'administrator' || value === 'member') role = value;
				}}
			>
				<Select.Trigger id="invite-role" class="w-full capitalize sm:w-56">
					{roleLabel(role)}
				</Select.Trigger>
				<Select.Content>
					<Select.Item value="member" label={roleLabel('member')} class="capitalize">
						{roleLabel('member')}
					</Select.Item>
					{#if canInviteAdministrators}
						<Select.Item
							value="administrator"
							label={roleLabel('administrator')}
							class="capitalize"
						>
							{roleLabel('administrator')}
						</Select.Item>
					{/if}
				</Select.Content>
			</Select.Root>
			{#if !canInviteAdministrators}
				<Field.Description
					>{$LL.organization.dashboard.administratorsAreTheOwners()}</Field.Description
				>
			{/if}
		</Field.Field>

		<Field.Set>
			<Field.Legend>{$LL.organization.dashboard.workspaces()}</Field.Legend>
			{#if workspaces.length === 0}
				<Field.Description>{$LL.organization.dashboard.noWorkspaceToGrant()}</Field.Description>
			{/if}
			{#each workspaces as workspace (workspace.id)}
				<Field.Field orientation="horizontal">
					<Checkbox
						id={`invite-workspace-${workspace.id}`}
						name="workspaceIds"
						checked={chosen.includes(workspace.id)}
						onCheckedChange={(checked) => toggle(workspace.id, checked === true)}
						disabled={isInviting}
					/>
					<Field.Label for={`invite-workspace-${workspace.id}`}>{workspace.name}</Field.Label>
				</Field.Field>
			{/each}
		</Field.Set>

		<Button type="submit" disabled={!canSubmit}>
			{isInviting ? $LL.common.actions.working() : $LL.organization.dashboard.invite()}
		</Button>
	</form>
{/if}
