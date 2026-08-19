<script lang="ts">
	import type {
		RemoteSyncAccount,
		RemoteSyncState,
		RemoteSyncWorkspace
	} from '$lib/platform/tauri';
	import { Badge, type BadgeVariant } from '$lib/design/primitive/badge';
	import { Button } from '$lib/design/primitive/button';
	import { Callout } from '$lib/design/primitive/callout';
	import { cn } from '$lib/design/tailwind.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { useSyncWorkspace } from '$lib/settings/query';
	import { signedInAccount } from '$lib/sync/account';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';

	let { syncState }: { syncState: RemoteSyncState } = $props();

	const syncWorkspaceMutation = useSyncWorkspace();
	const settingsInsetPanelClass = 'rounded-2xl border bg-muted p-4 text-start';

	const isSyncing = $derived(syncWorkspaceMutation.isPending);

	const activeWorkspace = $derived.by(() => syncState.workspace);

	/**
	 * who this machine is signed in as.
	 *
	 * *It was read off `workspace.accountId` — which only a Drive link ever wrote, so it answered
	 * for a workspace linked to a folder rather than for a person. Drive retired and the field
	 * went with it.* `signedInAccount` is the read the sign-in wall and the request context both
	 * use, and going through it is what stops this surface disagreeing with them about who is
	 * here.
	 */
	const activeAccount = $derived.by(() => signedInAccount(syncState));

	async function syncNow() {
		try {
			await syncWorkspaceMutation.mutateAsync();
		} catch {
			/* ignore */
		}
	}

	function getAvatarLabel(workspace: RemoteSyncWorkspace, account: RemoteSyncAccount | null) {
		const source = account?.displayName || workspace.name;
		return getInitials(source, 'WS');
	}

	function getInitials(source: string, fallback: string) {
		const parts = source
			.split(/\s+/)
			.map((part) => part.trim())
			.filter(Boolean)
			.slice(0, 2);

		return parts.map((part) => part[0]?.toUpperCase() ?? '').join('') || fallback;
	}

	function getWorkspaceStatus(
		workspace: RemoteSyncWorkspace,
		account: RemoteSyncAccount | null
	): { label: string; variant: BadgeVariant } {
		if (workspace.lastError || account?.lastError || account?.status === 'needsReconnect') {
			return { label: $LL.settings.syncAccountStatusNeedsReconnect(), variant: 'destructive' };
		}

		if (account?.status === 'pending') {
			return { label: $LL.settings.syncAccountStatusPending(), variant: 'secondary' };
		}

		return { label: $LL.settings.syncWorkspaceStatusSynced(), variant: 'default' };
	}
</script>

<!-- no heading row of its own: the group above is already called workspace, and the row said
     "workspace" under it and then listed the controls that follow. -->
<div class="space-y-5">
	<Callout variant="info">
		<strong>{$LL.settings.syncAutomationTitle()}</strong>
		<div class="mt-1 text-sm text-muted-foreground">
			{$LL.settings.syncAutomationDescription()}
		</div>
	</Callout>

	{#if !syncState.googleSignInReady}
		<Callout variant="warning">{$LL.settings.syncSignInPending()}</Callout>
	{/if}

	{#if activeWorkspace}
		<div class={cn(settingsInsetPanelClass, 'space-y-4')}>
			<div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
				<div class="min-w-0 flex-1 space-y-4 text-start">
					<div class="flex min-w-0 items-start gap-3 rtl:flex-row-reverse">
						<div
							class="flex size-12 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-foreground"
						>
							{getAvatarLabel(activeWorkspace, activeAccount)}
						</div>
						<div class="min-w-0 flex-1 space-y-2">
							<div class="flex flex-wrap items-center gap-2">
								<p class="text-lg font-semibold">{activeWorkspace.name}</p>
								<Badge variant={getWorkspaceStatus(activeWorkspace, activeAccount).variant}>
									{getWorkspaceStatus(activeWorkspace, activeAccount).label}
								</Badge>
							</div>
							<p class="text-sm text-muted-foreground">
								{activeAccount?.email ?? $LL.settings.syncProviderHosted()}
							</p>
						</div>
					</div>
				</div>

				<div class="w-full max-w-md space-y-3 text-start">
					<p class="text-sm text-muted-foreground">{$LL.settings.syncWorkspaceDescription()}</p>
					<Button variant="outline" onclick={() => void syncNow()} disabled={isSyncing}>
						<RefreshCwIcon class="size-4" />
						{isSyncing ? $LL.common.actions.working() : $LL.common.actions.syncNow()}
					</Button>
				</div>
			</div>

			{#if activeWorkspace.lastError || activeAccount?.lastError}
				<Callout variant="warning">
					{activeWorkspace.lastError ?? activeAccount?.lastError}
				</Callout>
			{/if}
		</div>
	{/if}
</div>
