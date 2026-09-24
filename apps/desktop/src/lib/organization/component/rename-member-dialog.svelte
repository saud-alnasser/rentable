<script lang="ts">
	import FieldError from '@rentable/design/block/field-error.svelte';
	import FormSurface, { insetControl } from '@rentable/design/block/form-surface.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as Form from '@rentable/design/primitive/form/index.js';
	import * as InputGroup from '@rentable/design/primitive/input-group/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { usernameSchema } from '$lib/organization/username-form';
	import UserIcon from '@lucide/svelte/icons/user';
	import SquarePenIcon from '@lucide/svelte/icons/square-pen';
	import { defaults, superForm } from 'sveltekit-superforms';
	import { zod4 } from 'sveltekit-superforms/adapters';
	import z from 'zod';

	/**
	 * Renaming a member: the one username they sign in with, from their row in the members list.
	 *
	 * **Light: one field**, and the weight is what it is rather than what the window is
	 * ([[rules/interface]], *Form surface*). Opened from the row's own control, for the owner or
	 * an administrator and never on the reader's own row, since an account's name is given and
	 * changed by an administrator and not by its holder; Rust refuses the same on the signed row.
	 *
	 * **The rule is requirement 21's, refused on the field first.** It is the one definition in
	 * `organization/username-form.ts`, the same schema the walk's `name` step and the invite
	 * dialog read, with the one sentence Rust's `validate_username` carries as `USERNAME_RULES`,
	 * so a username refused here is refused by the command and by every other field with the
	 * same words. Whether a username is taken is Rust's alone, because usernames are sealed and
	 * only an open vault can compare them; that refusal arrives as `BAD_REQUEST` and the shared
	 * handler shows it.
	 *
	 * **The field leads with its subject's glyph, muted**, and the rename carries its verb's, as
	 * the invite form's do. The mutation is the host's: this component owns the `superForm` and
	 * the surface and hands what was typed up through `onRename`, which is what keeps it
	 * renderable in a test with no query client.
	 */
	let {
		open,
		onOpenChange,
		username,
		isRenaming,
		onRename
	}: {
		open: boolean;
		onOpenChange: (value: boolean) => void;
		/** the username the member holds now, which the field opens on. */
		username: string;
		isRenaming: boolean;
		onRename: (username: string) => void;
	} = $props();

	// built when this component is, past the locale gate, for the reason
	// `organization/workspace-form.ts` gives: the message resolves against a locale.
	const RenameSchema = z.object({ username: usernameSchema($LL) });

	type RenameForm = z.infer<typeof RenameSchema>;

	let { form, constraints, errors, enhance, reset, ...rest } = superForm<RenameForm>(
		// blank here, because a fresh open sets the field to the row's username below.
		defaults({ username: '' }, zod4(RenameSchema)),
		{
			SPA: true,
			validators: zod4(RenameSchema),
			onUpdate: ({ form }) => {
				if (!form.valid || isRenaming) return;

				const next = form.data.username.trim();

				// unchanged is not a write: pressing rename on the name they already hold closes the
				// surface rather than spending a round trip on a row that would read the same.
				if (next === username) {
					onOpenChange(false);

					return;
				}

				onRename(next);
			}
		}
	);

	const superform = { form, constraints, errors, enhance, reset, ...rest };

	// a fresh open starts on the username the row holds, with nothing left over from the last.
	$effect(() => {
		if (open) {
			reset({ data: { username } });
		}
	});
</script>

<FormSurface
	{open}
	{onOpenChange}
	{enhance}
	weight="light"
	title={$LL.organization.dashboard.rename()}
	description={$LL.organization.dashboard.renameDescription()}
>
	<Form.Field form={superform} name="username" class="group relative">
		<Form.Control>
			<Form.Label>{$LL.organization.dashboard.username()}</Form.Label>
			<InputGroup.Root class={insetControl} data-disabled={isRenaming || undefined}>
				<InputGroup.Addon>
					<UserIcon />
				</InputGroup.Addon>
				<InputGroup.Input
					name="username"
					autocomplete="off"
					bind:value={$form.username}
					placeholder={$LL.organization.dashboard.username()}
					disabled={isRenaming}
					aria-invalid={$errors.username ? 'true' : undefined}
					{...$constraints.username}
				/>
			</InputGroup.Root>
		</Form.Control>
		<FieldError />
	</Form.Field>

	{#snippet actions()}
		<Button
			type="button"
			variant="outline"
			disabled={isRenaming}
			onclick={() => onOpenChange(false)}
		>
			{$LL.common.actions.cancel()}
		</Button>
		<!-- the verb's glyph before its label, as every primary here carries one. -->
		<Button type="submit" disabled={isRenaming}>
			<SquarePenIcon class="size-4" />
			{isRenaming ? $LL.common.actions.working() : $LL.organization.dashboard.rename()}
		</Button>
	{/snippet}
</FormSurface>
