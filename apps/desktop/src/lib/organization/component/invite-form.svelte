<script lang="ts">
	import type { Invited, OrganizationWorkspace } from '$lib/platform/tauri';
	import FieldError from '@rentable/design/block/field-error.svelte';
	import FormSurface, { insetControl } from '@rentable/design/block/form-surface.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import { Callout } from '@rentable/design/primitive/callout/index.js';
	import { Checkbox } from '@rentable/design/primitive/checkbox/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import * as Form from '@rentable/design/primitive/form/index.js';
	import * as InputGroup from '@rentable/design/primitive/input-group/index.js';
	import * as Select from '@rentable/design/primitive/select/index.js';
	import { cn } from '@rentable/design/tailwind.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import UserIcon from '@lucide/svelte/icons/user';
	import UserPlusIcon from '@lucide/svelte/icons/user-plus';
	import { defaults, superForm } from 'sveltekit-superforms';
	import { zod4 } from 'sveltekit-superforms/adapters';
	import z from 'zod';

	/**
	 * Inviting a member: an address, a name, a role, the workspaces they belong to.
	 *
	 * **On the shared form surface, heavy.** An invitation is a write, and every write here takes
	 * `FormSurface` ([[rules/interface]], *Form surface*); four fields and a result panel are the
	 * heavy weight, declared rather than measured, so this is the edge sheet and it fills the
	 * width below the breakpoint without swapping components under a half-typed form. It is
	 * mounted once, in the shell, and opened from the rail's menu and from the organization page
	 * alike; `organization/dialogs.svelte.ts` says why once is the number.
	 *
	 * **What comes back is shown once, and the form says it cannot send it.** The application has
	 * registered with no mail service and the spec forbids registering one on the customer's
	 * behalf, so the link and the generated password are handed over by the person who invited,
	 * and the two copy controls are what a person needs to do that. The password is on screen for
	 * as long as this panel is, and nowhere afterwards.
	 *
	 * **Inviting an administrator is the owner's**, because certifying one needs the organization
	 * key; the role select offers it only to the owner, and the shell refuses it regardless.
	 *
	 * **The fields lead with their subject's glyph, muted.** An icon covers more surface than the
	 * text beside it and reads as emphasised at the same colour, so the addon lowers its contrast
	 * (*Balance weight and contrast*, Refactoring UI p.56). A validation error still marks the
	 * field the way the rule says: the group's border from `aria-invalid`, and `FieldError` on
	 * the label line.
	 *
	 * **The mutation is the host's.** This component owns the `superForm` and the surface and
	 * hands what was typed up through `onInvite`; `layout/component/organization-dialogs.svelte`
	 * runs the invite and hands the result back as `invited`. That is what keeps this renderable
	 * in a test with no query client.
	 */
	let {
		open,
		onOpenChange,
		workspaces,
		canInviteAdministrators,
		isInviting,
		invited,
		copied,
		onInvite,
		onCopy,
		onDismiss
	}: {
		open: boolean;
		onOpenChange: (value: boolean) => void;
		/** the workspaces the inviter can grant, which is what they hold themselves. */
		workspaces: OrganizationWorkspace[];
		canInviteAdministrators: boolean;
		isInviting: boolean;
		/** what the last invitation made, shown until dismissed. */
		invited: Invited | null;
		/** which of the two was last copied, for the control to say so. */
		copied: 'link' | 'password' | null;
		onInvite: (username: string, role: 'administrator' | 'member', workspaceIds: string[]) => void;
		onCopy: (what: 'link' | 'password', value: string) => void;
		onDismiss: () => void;
	} = $props();

	// built when this component is, past the locale gate, for the reason
	// `organization/workspace-form.ts` gives: the messages resolve against a locale.
	const InviteSchema = z.object({
		username: z.string().trim().min(1, { message: $LL.organization.dashboard.nameRequired() }),
		role: z.enum(['administrator', 'member']),
		workspaceIds: z.array(z.string())
	});

	type InviteForm = z.infer<typeof InviteSchema>;

	const blank: InviteForm = { username: '', role: 'member', workspaceIds: [] };

	let { form, constraints, errors, enhance, reset, ...rest } = superForm<InviteForm>(
		defaults(blank, zod4(InviteSchema)),
		{
			SPA: true,
			validators: zod4(InviteSchema),
			onUpdate: ({ form }) => {
				if (!form.valid || isInviting) return;

				onInvite(form.data.username.trim(), form.data.role, form.data.workspaceIds);
			}
		}
	);

	const superform = { form, constraints, errors, enhance, reset, ...rest };

	// a fresh open is a fresh invitation, as every create form here starts blank; an open that
	// shows a result panel keeps the fields it will not draw.
	$effect(() => {
		if (open && !invited) {
			reset({ data: blank });
		}
	});

	const roleLabel = (value: string) =>
		({
			administrator: $LL.layout.signIn.roleAdministrator(),
			member: $LL.layout.signIn.roleMember()
		})[value] ?? value;

	const toggle = (id: string, checked: boolean) => {
		$form.workspaceIds = checked
			? [...new Set([...$form.workspaceIds, id])]
			: $form.workspaceIds.filter((held) => held !== id);
	};

	const done = () => {
		reset({ data: blank });
		onDismiss();
	};
</script>

<FormSurface
	{open}
	{onOpenChange}
	{enhance}
	weight="heavy"
	title={$LL.organization.dashboard.inviteTitle()}
	description={invited ? undefined : $LL.organization.dashboard.inviteDescription()}
>
	{#if invited}
		<div class="space-y-4" data-invited>
			<!-- the one notice this surface carries, because it is the one thing a person has to act
			     on: nothing was sent, and the two things below are theirs to send. -->
			<Callout tone="warning">{$LL.organization.dashboard.cannotSend()}</Callout>

			<div class="space-y-2">
				<p class="text-sm font-medium">{$LL.organization.dashboard.linkLabel()}</p>
				<!-- machine strings, read left to right in both locales ([[rules/frontend]], *i18n*). -->
				<code
					dir="ltr"
					class="block overflow-x-auto rounded-md bg-muted px-3 py-2 text-xs break-all select-all"
					data-invited-link>{invited.joinLink}</code
				>
				<Button
					type="button"
					variant="outline"
					size="sm"
					onclick={() => invited && onCopy('link', invited.joinLink)}
				>
					<CopyIcon class="size-4" />
					{copied === 'link'
						? $LL.organization.setup.linkCopied()
						: $LL.organization.setup.copyLink()}
				</Button>
			</div>

			{#if invited.unreachableWorkspaces.length > 0}
				<!-- requirement 13's limit, said at the moment it bites: what the reset could not
				     restore, because the resetting administrator does not reach it themselves. -->
				<Callout tone="warning" data-invited-unreachable>
					{$LL.organization.dashboard.unreachableWorkspaces({
						workspaces: invited.unreachableWorkspaces.map((workspace) => workspace.name).join(', ')
					})}
				</Callout>
			{/if}

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
					type="button"
					variant="outline"
					size="sm"
					onclick={() => invited && onCopy('password', invited.generatedPassword)}
				>
					<CopyIcon class="size-4" />
					{copied === 'password'
						? $LL.organization.dashboard.passwordCopied()
						: $LL.organization.dashboard.copyPassword()}
				</Button>
			</div>
		</div>
	{:else}
		<div class="flex flex-col gap-4" data-invite-form>
			<Form.Field form={superform} name="username" class="group relative">
				<Form.Control>
					<Form.Label>{$LL.common.labels.name()}</Form.Label>
					<InputGroup.Root class={insetControl} data-disabled={isInviting || undefined}>
						<InputGroup.Addon>
							<UserIcon />
						</InputGroup.Addon>
						<InputGroup.Input
							name="username"
							autocomplete="off"
							bind:value={$form.username}
							placeholder={$LL.common.labels.name()}
							disabled={isInviting}
							aria-invalid={$errors.username ? 'true' : undefined}
							{...$constraints.username}
						/>
					</InputGroup.Root>
				</Form.Control>
				<FieldError />
			</Form.Field>

			<Field.Field>
				<Field.Label for="invite-role">{$LL.organization.dashboard.role()}</Field.Label>
				<Select.Root
					type="single"
					value={$form.role}
					onValueChange={(value) => {
						if (value === 'administrator' || value === 'member') $form.role = value;
					}}
					disabled={isInviting}
				>
					<Select.Trigger id="invite-role" class={cn('w-full capitalize', insetControl)}>
						{roleLabel($form.role)}
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
							checked={$form.workspaceIds.includes(workspace.id)}
							onCheckedChange={(checked) => toggle(workspace.id, checked === true)}
							disabled={isInviting}
						/>
						<Field.Label for={`invite-workspace-${workspace.id}`}>{workspace.name}</Field.Label>
					</Field.Field>
				{/each}
			</Field.Set>
		</div>
	{/if}

	{#snippet actions()}
		{#if invited}
			<Button type="button" onclick={done}>{$LL.organization.dashboard.done()}</Button>
		{:else}
			<Button
				type="button"
				variant="outline"
				disabled={isInviting}
				onclick={() => onOpenChange(false)}
			>
				{$LL.common.actions.cancel()}
			</Button>
			<!-- the verb's glyph before its label, as every primary here carries one. -->
			<Button type="submit" disabled={isInviting}>
				<UserPlusIcon class="size-4" />
				{isInviting ? $LL.common.actions.working() : $LL.organization.dashboard.invite()}
			</Button>
		{/if}
	{/snippet}
</FormSurface>
