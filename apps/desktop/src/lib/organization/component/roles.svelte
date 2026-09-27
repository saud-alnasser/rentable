<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Empty from '@rentable/design/block/empty.svelte';
	import RecordCard from '@rentable/design/block/record-card.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import type { ListSort } from '@rentable/design/sort.js';
	import CreateControl from '$lib/design/block/create-control.svelte';
	import { toCardActions } from '$lib/design/acts';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { lacking, type RoleActRecord, type RoleReader } from '$lib/organization/acts';
	import DirectoryTray from '$lib/organization/component/directory-tray.svelte';
	import { toRoleDirectory } from '$lib/organization/directory';
	import { roleActs, roleHost, rolePending } from '$lib/organization/host.svelte';
	import { ADMINISTRATION_GLYPH, KIND_GLYPH } from '$lib/organization/glyph';
	import {
		ADMINISTRATION_TOTAL,
		administrationHeld,
		familyName,
		levelOf,
		levelWord,
		RECORD_KINDS,
		roleNameOf,
		type KindLevel,
		type RecordKind
	} from '$lib/organization/role';
	import type { OrganizationMember, OrganizationRole } from '$lib/platform/host';
	import { getIntlLocale } from '$lib/platform/locale';
	import { recordOf, ROLE_PARAM, withSection } from '$lib/settings/section';
	import CrownIcon from '@lucide/svelte/icons/crown';
	import XIcon from '@lucide/svelte/icons/x';

	/**
	 * The organization's roles, highest first, each with what it carries grouped by family (effort
	 * 838, requirements 3, 4 and 12).
	 *
	 * **A directory of record cards, the members directory's shape**: the settings directories' tray
	 * (`directory-tray.svelte`) with the block's name and sentence over the list shell's bar, and a
	 * card per role below. The card is the record, and its quiet control carries the role's acts,
	 * declared once in `organization/acts.ts`: edit, move up, move down and delete. What an act opens
	 * is the organization host's, mounted once in the frame.
	 *
	 * **Activating a card opens its record** ([[rules/interface]], *Row activation*). A role has no
	 * page, so what opening one means is its editor, on this section's address with the role named
	 * on it, consumed on arrival and cleared as the members directory consumes a member. The rule
	 * records this beside the members and workspaces directories: in the settings directories a
	 * record's page is its sheet.
	 *
	 * **Searched by name and ordered from the bar, by rank until another order is chosen**
	 * ([[rules/interface]], *Search* and *Sort*). The ranking is what the list is for, so it is the
	 * order the roles arrive in and the first the control offers; the name is the other, for the
	 * reader who knows what a role is called and not where it stands. The narrowing is
	 * `organization/directory.ts`'s. A section answers `/` once, so where the members directory is
	 * drawn below, the key is that directory's: a dozen people are searched, a handful of roles
	 * read. *It drew a head of its own, with no search and no order, until ticket 19 of effort 838
	 * gave it the bar every settings directory has.*
	 *
	 * **The one create stands last at the end of the bar** ([[rules/interface]], *Create*), refused
	 * with the flag it needs where the reader lacks it.
	 *
	 * **A card sums the role by kind of record, a line per level** (requirement 12 as amended
	 * 2026-09-27): the level's word (`levelWord`: *full access*, *can edit*, *can add*, *view
	 * only*) and then each kind on it under its glyph, *can edit* then complexes, units, tenants.
	 * A kind it cannot see is left out; the owner reads *everything*, under its crown; and where
	 * the role holds any of the organization's ten, one line says how many, in the words the
	 * switch list's folded group uses. How many hold it sits beside the name, and the rank is the
	 * list's order.
	 *
	 * *Lines by level rather than a row per kind*, because a role is mostly one or two levels: the
	 * member is one line and the manager one line and a count, where rows would be five apiece and
	 * the card would stop being scannable in a list of them. The reader reads the level first and
	 * the kinds after it, the way sharing products put the level before the people it applies to.
	 * A mix off the ladder is its own line, named by its verbs.
	 *
	 * **Drawn for everybody signed in**, since what each role may do is not a secret from the people
	 * who hold them. An act the reader may not take is refused with its reason (the flag they lack,
	 * or a role not below their own), and the create says why where the reader may not make one.
	 */
	let {
		roles,
		members = [],
		reader,
		answersSearchKey = true
	}: {
		/** every role the organization has. */
		roles: readonly OrganizationRole[];
		/**
		 * every member, whose holders of a role its delete and its editor answer for (ticket 45 of
		 * effort 838).
		 */
		members?: readonly OrganizationMember[];
		/** who is reading, as the role acts are gated on it. */
		reader: RoleReader;
		/**
		 * whether `/` puts the cursor in this block's search: not where the members directory is
		 * drawn beside it, which is the set a reader searches.
		 */
		answersSearchKey?: boolean;
	} = $props();

	// the address of the section this block sits in, resolved once, as the members directory does.
	const sectionAddress = resolve(withSection('organization'));

	const addressOf = (roleId: string) =>
		`${sectionAddress}&${ROLE_PARAM}=${encodeURIComponent(roleId)}`;

	const nameOf = (role: OrganizationRole) => roleNameOf($LL, role);

	let search = $state('');
	// the empty treatment at a settings section's size, as the other directories draw it.
	const DIRECTORY_EMPTY = 'h-auto flex-none gap-3 rounded-2xl border border-dashed p-4 md:p-6';
	let sort = $state<ListSort | null>(null);

	const sortOptions = $derived([
		{ id: 'rank', label: $LL.organization.roleList.rank() },
		{ id: 'name', label: $LL.common.labels.name() }
	]);

	const shown = $derived(toRoleDirectory(roles, search, sort, nameOf));

	const recordOfRole = (role: OrganizationRole): RoleActRecord => ({
		role,
		roles,
		members,
		reader,
		pending: rolePending()
	});

	const list = $derived(new Intl.ListFormat(getIntlLocale($locale), { type: 'unit' }));

	/** the order the lines go in: the widest level first, and any mix off the ladder last. */
	const LEVEL_ORDER: readonly KindLevel[] = ['full', 'edit', 'add', 'view', 'mixed'];

	/**
	 * a line per level the role has any kind on: the level's words and the kinds on it, in the
	 * switch list's order. Kinds on the same mix share a line, since they read the same words.
	 */
	const levelsOf = (role: OrganizationRole) => {
		const lines: { level: KindLevel; word: string; kinds: RecordKind[] }[] = [];

		for (const kind of RECORD_KINDS) {
			const word = levelWord($LL, list, role.mask, kind);

			if (word === null) continue;

			const line = lines.find((each) => each.word === word);

			if (line) line.kinds.push(kind);
			else lines.push({ level: levelOf(role.mask, kind), word, kinds: [kind] });
		}

		return lines.sort(
			(one, other) => LEVEL_ORDER.indexOf(one.level) - LEVEL_ORDER.indexOf(other.level)
		);
	};

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

{#snippet trayActions()}
	<!-- the block's one create, last in the tray ([[rules/interface]], *Create*), refused with the
	     flag it needs where the reader lacks it. -->
	<CreateControl
		label={$LL.organization.roleList.add()}
		onCreate={() => roleHost.create()}
		unavailable={reader.canManageRoles ? undefined : lacking($LL, 'manageRoles')}
		data-role-add
	/>
{/snippet}

<Field.Set class="gap-3" aria-labelledby="roles-legend" data-roles>
	<DirectoryTray
		legendId="roles-legend"
		legend={$LL.organization.roleList.title()}
		description={$LL.organization.roleList.description()}
		bind:search
		{answersSearchKey}
		count={shown.length}
		{sortOptions}
		bind:sort
		action={trayActions}
	/>

	<div class="flex flex-col gap-3">
		{#if roles.length > 0 && shown.length === 0}
			<!-- the one empty treatment's no-match ([[rules/interface]], *Empty*): the search found no
			     role, and the way out is putting it down. -->
			<div data-directory-no-match>
				<Empty kind="no-match" title={$LL.common.messages.noMatch()} class={DIRECTORY_EMPTY}>
					{#snippet action()}
						<Button type="button" variant="outline" size="sm" onclick={() => (search = '')}>
							<XIcon />
							{$LL.common.actions.clearSearch()}
						</Button>
					{/snippet}
				</Empty>
			</div>
		{/if}

		{#each shown as role (role.id)}
			<div data-role={role.id} data-role-kind={role.kind}>
				<RecordCard
					href={addressOf(role.id)}
					label={nameOf(role)}
					actions={toCardActions(roleActs, recordOfRole(role), $LL)}
					class="gap-4 py-3"
				>
					{#snippet content()}
						<div class="pointer-events-none relative flex min-w-0 flex-1 flex-col gap-1 text-start">
							<div class="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
								<span class="truncate text-sm font-medium first-letter:uppercase" data-role-name>
									<bdi>{nameOf(role)}</bdi>
								</span>
								<span class="text-xs text-muted-foreground tabular-nums" data-role-holders>
									{role.holders === 0
										? $LL.organization.roleList.heldByNobody()
										: $LL.organization.roleList.heldBy({ count: role.holders })}
								</span>
							</div>

							{#if role.kind === 'owner'}
								<p
									class="flex items-center gap-1.5 text-xs leading-snug font-medium"
									data-role-everything
								>
									<CrownIcon class="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
									{$LL.organization.roleCard.everything()}
								</p>
							{:else}
								{@const held = administrationHeld(role.mask)}
								{#each levelsOf(role) as line (line.word)}
									<div
										class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs leading-snug"
										data-role-level={line.level}
									>
										<span class="font-medium" data-role-level-word>{line.word}</span>
										<ul class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-muted-foreground">
											{#each line.kinds as kind (kind)}
												{@const Glyph = KIND_GLYPH[kind]}
												<li class="flex items-center gap-1" data-role-kind-line={kind}>
													<Glyph class="size-3.5 shrink-0" aria-hidden="true" />
													{familyName($LL, kind)}
												</li>
											{/each}
										</ul>
									</div>
								{:else}
									{#if held === 0}
										<p class="text-xs text-muted-foreground" data-role-carries-nothing>
											{$LL.organization.roleList.carriesNothing()}
										</p>
									{/if}
								{/each}
								{#if held > 0}
									<p
										class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs leading-snug"
										data-role-administers
									>
										<span class="font-medium">{$LL.organization.roleCard.administers()}</span>
										<span class="flex items-center gap-1 text-muted-foreground tabular-nums">
											<ADMINISTRATION_GLYPH class="size-3.5 shrink-0" aria-hidden="true" />
											{$LL.organization.switches.folded({
												count: held,
												total: ADMINISTRATION_TOTAL
											})}
										</span>
									</p>
								{/if}
							{/if}
						</div>
					{/snippet}
				</RecordCard>
			</div>
		{/each}
	</div>
</Field.Set>
