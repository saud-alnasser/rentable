<script lang="ts">
	import type { OrganizationWorkspace, WorkspaceGrant } from '$lib/platform/tauri';
	import type { InvitedCopy, InvitedLink } from '$lib/organization/dialogs.svelte';
	import { usernameSchema } from '$lib/organization/username-form';
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
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import UserIcon from '@lucide/svelte/icons/user';
	import UserPlusIcon from '@lucide/svelte/icons/user-plus';
	import { defaults, superForm } from 'sveltekit-superforms';
	import { zod4 } from 'sveltekit-superforms/adapters';
	import z from 'zod';

	/**
	 * Making an account, which is what inviting is: a username, a role, the workspaces they hold
	 * and what each one is good for.
	 *
	 * **On the shared form surface, heavy.** An invitation is a write, and every write here takes
	 * `FormSurface` ([[rules/interface]], *Form surface*); three fields and a result panel are the
	 * heavy weight, declared rather than measured, so this is the edge sheet and it fills the
	 * width below the breakpoint without swapping components under a half-typed form. It is
	 * mounted once, in the shell, and opened from the rail's menu and from the members section
	 * alike; `organization/dialogs.svelte.ts` says why once is the number.
	 *
	 * **The username is the whole of the identity, under the one rule.** No address and no display
	 * name: the member signs in with the username and nothing else names them (requirement 21 of
	 * effort 824). The rule it is refused by is `organization/username-form.ts`, the same schema
	 * the walk's `name` step and the rename dialog read, so a username refused here is refused
	 * there with the same sentence.
	 *
	 * **A workspace is a checkbox and an access**, which is requirement 8 of effort 826: what the
	 * invitation grants is what the member's row will carry, and a grant that could only ever be
	 * full access made the read-only half of the model unreachable from the one surface that
	 * creates grants. Read only is minted on the owner's machine and refused by name elsewhere,
	 * so for anybody else the choice is drawn refused rather than hidden: a control that vanishes
	 * says the access does not exist.
	 *
	 * **What comes back is one link, and the form says it cannot send it.** The application has
	 * registered with no mail service and the spec forbids registering one on the customer's
	 * behalf, so the invitation link is handed over by the person who invited, and one copy
	 * control is what a person needs to do that (effort 826, requirement 8). No password is shown.
	 * *Three things with three copy controls until effort 826.*
	 *
	 * **The code is shown under the link and has no copy control** (requirement 23). The link
	 * carries one half of what opens the invited vault and the code is the other, so a code
	 * pasted beside the link is a link that opens on its own: the one affordance it gets is being
	 * large enough to read out. Beside it are the seconds it has left, counted down, and a
	 * control that makes a fresh one, because ninety seconds is short enough that the ordinary
	 * case is making another.
	 *
	 * **The same panel answers three acts**: an invitation, a new link on somebody's row, and a
	 * pending row's copy link. Each ends with one link in one person's hands, so the panel is
	 * handed a link and a username rather than the payload of whichever act produced it.
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
		organizationName,
		workspaces,
		canInviteAdministrators,
		canGrantReadOnly,
		isInviting,
		invited,
		copied,
		isFresheningCode,
		onInvite,
		onCopy,
		onFreshCode,
		onDismiss
	}: {
		open: boolean;
		onOpenChange: (value: boolean) => void;
		/** the organization the link admits into, named on the result panel. */
		organizationName: string;
		/** the workspaces the inviter can grant, which is what they hold themselves. */
		workspaces: OrganizationWorkspace[];
		canInviteAdministrators: boolean;
		/** whether this machine holds the Turso authority, which is what mints a read-only credential. */
		canGrantReadOnly: boolean;
		isInviting: boolean;
		/** the link the last act produced, shown until dismissed. */
		invited: InvitedLink | null;
		/** which of the panel's values was last copied, for the control to say so. */
		copied: InvitedCopy | null;
		/** a fresh code is being made, while it is. */
		isFresheningCode: boolean;
		onInvite: (
			username: string,
			role: 'administrator' | 'member',
			workspaces: WorkspaceGrant[]
		) => void;
		onCopy: (what: InvitedCopy, value: string) => void;
		/** make a fresh code for the invitation this panel is showing. */
		onFreshCode: (invitationId: string) => void;
		onDismiss: () => void;
	} = $props();

	// built when this component is, past the locale gate, for the reason
	// `organization/workspace-form.ts` gives: the messages resolve against a locale.
	const InviteSchema = z.object({
		username: usernameSchema($LL),
		role: z.enum(['administrator', 'member']),
		workspaceIds: z.array(z.string())
	});

	type InviteForm = z.infer<typeof InviteSchema>;

	const blank: InviteForm = { username: '', role: 'member', workspaceIds: [] };

	/**
	 * the access chosen per workspace, held beside the form rather than in it.
	 *
	 * A superforms field carries what a schema can refuse, and this is a choice with no refusal
	 * of its own: an unchecked workspace is not granted at all, so its access says nothing, and a
	 * checked one is always one of two values. The checkbox is the field; this is what it is
	 * worth.
	 */
	let access = $state<Record<string, WorkspaceGrant['access']>>({});

	let { form, constraints, errors, enhance, reset, ...rest } = superForm<InviteForm>(
		defaults(blank, zod4(InviteSchema)),
		{
			SPA: true,
			validators: zod4(InviteSchema),
			onUpdate: ({ form }) => {
				if (!form.valid || isInviting) return;

				onInvite(
					form.data.username.trim(),
					form.data.role,
					form.data.workspaceIds.map((id) => ({ id, access: access[id] ?? 'full-access' }))
				);
			}
		}
	);

	const superform = { form, constraints, errors, enhance, reset, ...rest };

	// a fresh open is a fresh invitation, as every create form here starts blank; an open that
	// shows a result panel keeps the fields it will not draw.
	$effect(() => {
		if (open && !invited) {
			reset({ data: blank });
			access = {};
		}
	});

	const roleLabel = (value: string) =>
		({
			administrator: $LL.layout.signIn.roleAdministrator(),
			member: $LL.layout.signIn.roleMember()
		})[value] ?? value;

	const accessLabel = (value: WorkspaceGrant['access']) =>
		value === 'read-only'
			? $LL.organization.dashboard.accessReadOnly()
			: $LL.organization.dashboard.accessFull();

	const toggle = (id: string, checked: boolean) => {
		$form.workspaceIds = checked
			? [...new Set([...$form.workspaceIds, id])]
			: $form.workspaceIds.filter((held) => held !== id);

		if (checked && !access[id]) access[id] = 'full-access';
	};

	const done = () => {
		reset({ data: blank });
		access = {};
		onDismiss();
	};

	/**
	 * the seconds the code has left, counted down on screen.
	 *
	 * **A second is the resolution because ninety of them is the whole life of the thing**: a
	 * person reading a code out needs to know whether to finish or to make another, and a bar or a
	 * ring would say that less exactly than the number does. The tick is torn down with the panel,
	 * and it stops at nought rather than running negative; what actually refuses a lapsed code is
	 * the row against the other machine's clock, so this is an affordance and never the barrier.
	 */
	let now = $state(Date.now());

	$effect(() => {
		if (!invited?.codeExpiresAt) return;

		now = Date.now();

		const tick = setInterval(() => {
			now = Date.now();
		}, 1000);

		return () => clearInterval(tick);
	});

	const secondsLeft = $derived(
		invited?.codeExpiresAt ? Math.max(0, Math.ceil((invited.codeExpiresAt - now) / 1000)) : 0
	);
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
			<!-- the organization the link admits into leads the panel: the link is opaque, and the
			     one fact a person hands over with it is which organization it opens. -->
			<p class="text-sm font-medium" data-invited-organization>{organizationName}</p>

			<!-- the one notice this surface carries, because it is the one thing a person has to act
			     on: nothing was sent, and the link below is theirs to send. -->
			<Callout tone="warning">{$LL.organization.dashboard.cannotSend()}</Callout>

			<div class="space-y-2">
				<div class="flex flex-wrap items-baseline gap-2">
					<p class="text-sm font-medium">{$LL.organization.dashboard.invitationLinkTitle()}</p>
					<p class="truncate text-sm text-muted-foreground" data-invited-username>
						{invited.username}
					</p>
				</div>
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

			{#if invited.code}
				<!-- the code under the link and drawn at the size a person reads out loud from, with
				     the seconds it has left beside it: the two things they need at once are the
				     characters and whether there is still time (effort 826, requirement 23). It is
				     the one value on this panel with no copy control, because copying it is how it
				     ends up pasted beside the link, which is the one thing it must never be. -->
				<div class="space-y-2" data-invited-code-block>
					<div class="flex flex-wrap items-baseline gap-2">
						<p class="text-sm font-medium">{$LL.organization.dashboard.codeTitle()}</p>
						<span
							class="text-xs"
							class:text-muted-foreground={secondsLeft > 0}
							class:text-destructive={secondsLeft === 0}
							data-invited-code-seconds
						>
							{secondsLeft > 0
								? $LL.organization.dashboard.codeExpires({ seconds: String(secondsLeft) })
								: $LL.organization.dashboard.codeLapsed()}
						</span>
					</div>
					<!-- a machine string, read left to right in both locales ([[rules/frontend]], *i18n*). -->
					<p
						dir="ltr"
						class="font-mono text-3xl font-semibold tracking-[0.3em] select-all"
						data-invited-code
					>
						{invited.code}
					</p>
					<p class="text-sm text-muted-foreground">
						{$LL.organization.dashboard.codeDescription()}
					</p>
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={isFresheningCode}
						data-invited-fresh-code
						onclick={() => invited && onFreshCode(invited.invitationId)}
					>
						<RefreshCwIcon class="size-4" />
						{isFresheningCode
							? $LL.common.actions.working()
							: $LL.organization.dashboard.freshCode()}
					</Button>
				</div>
			{/if}

			{#if invited.unreachableWorkspaces.length > 0}
				<!-- requirement 9's limit, said at the moment it bites: what the reset could not
				     restore, because the resetting administrator does not reach it themselves. -->
				<Callout tone="warning" data-invited-unreachable>
					{$LL.organization.dashboard.unreachableWorkspaces({
						workspaces: invited.unreachableWorkspaces.map((workspace) => workspace.name).join(', ')
					})}
				</Callout>
			{/if}
		</div>
	{:else}
		<div class="flex flex-col gap-4" data-invite-form>
			<Form.Field form={superform} name="username" class="group relative">
				<Form.Control>
					<Form.Label>{$LL.organization.dashboard.username()}</Form.Label>
					<InputGroup.Root class={insetControl} data-disabled={isInviting || undefined}>
						<InputGroup.Addon>
							<UserIcon />
						</InputGroup.Addon>
						<InputGroup.Input
							name="username"
							autocomplete="off"
							bind:value={$form.username}
							placeholder={$LL.organization.dashboard.username()}
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
				<Field.Legend>{$LL.settings.section.workspaces()}</Field.Legend>
				{#if workspaces.length === 0}
					<Field.Description>{$LL.organization.dashboard.noWorkspaceToGrant()}</Field.Description>
				{/if}
				{#each workspaces as workspace (workspace.id)}
					{@const held = $form.workspaceIds.includes(workspace.id)}
					<Field.Field orientation="horizontal" data-invite-workspace={workspace.id}>
						<Checkbox
							id={`invite-workspace-${workspace.id}`}
							name="workspaceIds"
							checked={held}
							onCheckedChange={(checked) => toggle(workspace.id, checked === true)}
							disabled={isInviting}
						/>
						<Field.Label for={`invite-workspace-${workspace.id}`} class="flex-1">
							{workspace.name}
						</Field.Label>
						<!-- the access is the grant's own value and reads beside it; a workspace nobody
						     granted has none to choose, so the control waits for the checkbox. -->
						<Select.Root
							type="single"
							value={access[workspace.id] ?? 'full-access'}
							onValueChange={(value) => {
								if (value === 'full-access' || value === 'read-only') {
									access[workspace.id] = value;
								}
							}}
							disabled={isInviting || !held}
						>
							<Select.Trigger
								class={cn('w-40 shrink-0', insetControl)}
								data-invite-access={workspace.id}
							>
								{accessLabel(access[workspace.id] ?? 'full-access')}
							</Select.Trigger>
							<Select.Content>
								<Select.Item value="full-access" label={accessLabel('full-access')}>
									{accessLabel('full-access')}
								</Select.Item>
								<!-- drawn refused rather than absent: the access exists, and who mints it is
								     the fact worth saying (requirement 5). -->
								<Select.Item
									value="read-only"
									label={accessLabel('read-only')}
									disabled={!canGrantReadOnly}
								>
									{accessLabel('read-only')}
								</Select.Item>
							</Select.Content>
						</Select.Root>
					</Field.Field>
				{/each}
				{#if !canGrantReadOnly && workspaces.length > 0}
					<Field.Description>{$LL.organization.dashboard.readOnlyIsTheOwners()}</Field.Description>
				{/if}
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
