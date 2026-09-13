<script lang="ts">
	import CopyIcon from '@lucide/svelte/icons/copy';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import { Callout } from '@rentable/design/primitive/callout/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { useOrganizationLink } from '$lib/organization/query';
	import { toast } from 'svelte-sonner';

	/**
	 * The organization's own link, for the owner to share or keep.
	 *
	 * **The link is half of the way in.** It connects a machine to the organization and admits
	 * nobody by itself; a username and a password, made inside the application, are the other
	 * half (requirements 18 and 25 of effort 824), and the sentence under the section says so.
	 * The invite dialog hands the same link over beside the username and the generated password.
	 *
	 * **The owner reads it any time, not only at setup.** A link shown once and never again is a
	 * way to lose the organization once the first machine is gone. It is drawn only where the
	 * dashboard already knows the reader is the owner, and the command behind it refuses anyone
	 * else; the credential it carries is the owner's own.
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
