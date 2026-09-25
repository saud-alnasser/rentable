<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import RecordCard from '@rentable/design/block/record-card.svelte';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import CreateControl from '$lib/design/block/create-control.svelte';
	import { toCardActions } from '$lib/design/acts';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { lacking, type RoleActRecord, type RoleReader } from '$lib/organization/acts';
	import { roleActs, roleHost, rolePending } from '$lib/organization/host.svelte';
	import {
		byRank,
		carriedIn,
		familyName,
		flagName,
		LISTED_FAMILIES,
		roleNameOf
	} from '$lib/organization/role';
	import type { OrganizationRole } from '$lib/platform/host';
	import { getIntlLocale } from '$lib/platform/locale';
	import { recordOf, ROLE_PARAM, withSection } from '$lib/settings/section';

	/**
	 * The organization's roles, highest first, each with what it carries grouped by family (effort
	 * 838, requirements 3, 4 and 12).
	 *
	 * **A list of record cards, the members directory's shape**: a head saying what the block is,
	 * its one create at the end, and a card per role. The card is the record, and its quiet control
	 * carries the role's acts, declared once in `organization/acts.ts`: edit, move up, move down and
	 * delete. What an act opens is the organization host's, mounted once in the frame. Activating a
	 * card opens its editor on this section's address, the way a member's card opens their sheet.
	 *
	 * **No search and no order.** An organization has a handful of roles, and their order is the
	 * point: it is the ranking, and a list sorted any other way would hide it.
	 *
	 * **A card says what the role carries, a line per family**, the family's name and then each
	 * flag it carries in that family, and how many hold it. A family it carries nothing of is left
	 * out, so a card is as long as the role is wide.
	 *
	 * **Drawn for everybody signed in**, since what each role may do is not a secret from the people
	 * who hold them. An act the reader may not take is refused with its reason (the flag they lack,
	 * or a role not below their own), and the create says why where the reader may not make one.
	 */
	let {
		roles,
		reader
	}: {
		/** every role the organization has. */
		roles: readonly OrganizationRole[];
		/** who is reading, as the role acts are gated on it. */
		reader: RoleReader;
	} = $props();

	// the address of the section this block sits in, resolved once, as the members directory does.
	const sectionAddress = resolve(withSection('organization'));

	const addressOf = (roleId: string) =>
		`${sectionAddress}&${ROLE_PARAM}=${encodeURIComponent(roleId)}`;

	const ordered = $derived(byRank(roles));

	const recordOfRole = (role: OrganizationRole): RoleActRecord => ({
		role,
		roles,
		reader,
		pending: rolePending()
	});

	const list = $derived(new Intl.ListFormat(getIntlLocale($locale), { type: 'unit' }));

	/** a line per family the role carries anything of: the family, and the flags it carries in it. */
	const carriesOf = (role: OrganizationRole) =>
		LISTED_FAMILIES.flatMap((family) => {
			const carried = carriedIn(role.mask, family);

			return carried.length === 0
				? []
				: [
						{
							family,
							name: familyName($LL, family),
							flags: list.format(carried.map((flag) => flagName($LL, flag)))
						}
					];
		});

	// the role the address names is opened and then cleared out of it, as the members directory does.
	$effect(() => {
		const named = recordOf(page.url, ROLE_PARAM);

		if (!named) return;

		const role = roles.find((candidate) => candidate.id === named);

		if (!role && roles.length === 0) return;

		if (role) roleHost.run('role.edit', recordOfRole(role));

		void goto(sectionAddress, { replaceState: true, noScroll: true, keepFocus: true });
	});
</script>

<Field.Set class="gap-3" aria-labelledby="roles-legend" data-roles>
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0">
			<Field.Legend id="roles-legend">{$LL.organization.roleList.title()}</Field.Legend>
			<Field.Description>{$LL.organization.roleList.description()}</Field.Description>
		</div>

		<!-- the block's one create, at its end ([[rules/interface]], *Create*), refused with the
		     flag it needs where the reader lacks it. -->
		<CreateControl
			label={$LL.organization.roleList.add()}
			onCreate={() => roleHost.create()}
			unavailable={reader.canManageRoles ? undefined : lacking($LL, 'manageRoles')}
			data-role-add
		/>
	</div>

	<div class="flex flex-col gap-3">
		{#each ordered as role (role.id)}
			<div data-role={role.id} data-role-kind={role.kind}>
				<RecordCard
					href={addressOf(role.id)}
					label={roleNameOf($LL, role)}
					actions={toCardActions(roleActs, recordOfRole(role), $LL)}
					class="gap-4 py-3"
				>
					{#snippet content()}
						<div class="pointer-events-none relative flex min-w-0 flex-1 flex-col gap-1 text-start">
							<div class="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
								<span class="truncate text-sm font-medium first-letter:uppercase" data-role-name>
									<bdi>{roleNameOf($LL, role)}</bdi>
								</span>
								<span class="text-xs text-muted-foreground tabular-nums" data-role-holders>
									{role.holders === 0
										? $LL.organization.roleList.heldByNobody()
										: $LL.organization.roleList.heldBy({ count: role.holders })}
								</span>
							</div>

							{#each carriesOf(role) as line (line.family)}
								<p
									class="text-xs leading-snug text-muted-foreground"
									data-role-carries={line.family}
								>
									<span class="font-medium text-foreground">{line.name}</span>
									{line.flags}
								</p>
							{:else}
								<p class="text-xs text-muted-foreground" data-role-carries-nothing>
									{$LL.organization.roleList.carriesNothing()}
								</p>
							{/each}
						</div>
					{/snippet}
				</RecordCard>
			</div>
		{/each}
	</div>
</Field.Set>
