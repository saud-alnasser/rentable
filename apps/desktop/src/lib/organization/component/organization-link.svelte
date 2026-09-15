<script lang="ts">
	import CopyIcon from '@lucide/svelte/icons/copy';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import { Callout } from '@rentable/design/primitive/callout/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { useOrganizationLink } from '$lib/organization/query';
	import { toast } from 'svelte-sonner';

	/**
	 * The organization's own link: the owner's recovery copy, and nothing else now.
	 *
	 * **It is handed to nobody** (effort 828, requirement 4). Every other link this application
	 * makes seals what it carries under a code somebody reads out, and lapses with the credential
	 * inside it; this one does neither, because when every machine is gone there is nobody left to
	 * read a code out and nothing left to renew a grant. So it stays here, for the owner alone,
	 * named as the copy that recovers the organization rather than as the way a second machine is
	 * connected. *Effort 826 handed this link to every member for exactly that, which put a
	 * never-expiring read of the directory in every chat the organization has; a member makes
	 * their own link for their own next machine now, and the sentence points them there.*
	 *
	 * **What it is still worth to whoever finds it is said beside it**, since nothing about the
	 * link changed and the risk is recorded rather than removed: it carries a read only view of
	 * the directory and it does not expire.
	 *
	 * **The owner reads it any time, not only at setup.** A link shown once and never again is a
	 * way to lose the organization once the first machine is gone. It is drawn only where the area
	 * already knows the reader is the owner, and the command behind it refuses anyone else; the
	 * credential it carries is the owner's own.
	 */
	let { isOwner }: { isOwner: boolean } = $props();

	const linkQuery = useOrganizationLink(() => isOwner);
	let copied = $state(false);

	async function copy() {
		const link = linkQuery.data;

		if (!link) {
			return;
		}

		try {
			await navigator.clipboard.writeText(link);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			toast.error($LL.common.messages.unexpectedError());
		}
	}
</script>

<Field.Field orientation="vertical">
	<Field.Content>
		<Field.Description data-link-description
			>{$LL.organization.dashboard.linkDescription()}</Field.Description
		>
	</Field.Content>

	{#if linkQuery.data}
		<!-- a machine's string, so it reads left to right in both locales ([[rules/frontend]], *i18n*). -->
		<code
			dir="ltr"
			class="block overflow-x-auto rounded-md bg-muted px-3 py-2 text-xs break-all select-all"
			data-organization-link>{linkQuery.data}</code
		>
		<Button variant="outline" size="sm" onclick={() => void copy()}>
			<CopyIcon class="size-4 shrink-0" />
			{copied ? $LL.organization.setup.linkCopied() : $LL.organization.setup.copyLink()}
		</Button>
	{:else if linkQuery.isError}
		<Callout tone="error">{$LL.common.messages.unexpectedError()}</Callout>
	{/if}
</Field.Field>
