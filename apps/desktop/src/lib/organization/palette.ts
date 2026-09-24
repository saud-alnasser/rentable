import { toPaletteActs, toPaletteVerbs, type PaletteAct, type RecordAct } from '$lib/design/acts';
import { showErrorSentence } from '$lib/error/toast';
import { LL } from '$lib/i18n/i18n-svelte';
import type { TranslationFunctions } from '$lib/i18n/i18n-types';
import type { PaletteMatch, RecordSearch } from '$lib/layout/palette';
import {
	memberReaderOf,
	toMemberActContext,
	workspaceContextOf,
	type MemberActId,
	type MemberActRecord,
	type WorkspaceActId,
	type WorkspaceActRecord
} from '$lib/organization/acts';
import { toMemberDirectory, toWorkspaceDirectory } from '$lib/organization/directory';
import {
	memberActs,
	memberHost,
	memberPending,
	workspaceActs,
	workspaceHost
} from '$lib/organization/host.svelte';
import {
	useFetchMemberStandings,
	useFetchMembers,
	useFetchOrganizationState
} from '$lib/organization/query';
import { useFetchRemoteSyncState } from '$lib/settings/query';
import { usesAppleKeyboard } from '@rentable/design/shortcut.js';
import { get } from 'svelte/store';

/**
 * MEMBER AND WORKSPACE ACTS, IN THE COMMAND MENU
 *
 * What the command menu offers of a member's and a workspace's acts, and how it runs one on the
 * record the reader names. The acts are the lists the settings directories draw
 * (`organization/acts.ts`); what is here is where the menu reads the facts they are gated on.
 *
 * **The gates are read by the builders the directories read them by** (`memberReaderOf`,
 * `toMemberActContext`, `workspaceContextOf`), from the same queries the settings route reads, so
 * the menu cannot offer an act a card does not. Every gate is today's, and Rust refuses each act
 * again on the signed row.
 *
 * **A reader's gates are known before a record is named**, which is where these two differ from a
 * contract. So an act is offered only where it applies to somebody (an administrator without
 * `removeMember` is never offered *remove*), and once one is chosen the menu lists only the records
 * it applies to (nobody is offered their own card to remove). An act that applies but is waiting on
 * a write already running is listed and refused, with the reason, as a card's menu refuses it.
 *
 * **Both sets are held in memory**, as the directories hold them, so the menu lists every record an
 * act applies to before anything is typed, and a term narrows them through the directories' own
 * search: an organization's members and workspaces are a handful, and choosing one from a list
 * asks less of the reader than recalling how it is spelled.
 */

/** one of the two, as the command menu offers it: its acts, the records they run on, and the run. */
export type OrganizationOffering = {
	offered: (translations: TranslationFunctions, isAppleKeyboard: boolean) => PaletteAct[];
	find: (term: () => string, asked: () => string | null) => RecordSearch;
	runOn: (actId: string, recordId: string) => void;
};

/** how a record of one of the two reads in the command menu, and what names it. */
type Described<T> = {
	idOf: (record: T) => string;
	labelOf: (record: T, translations: TranslationFunctions) => string;
	hintOf: (record: T, translations: TranslationFunctions) => string;
	/** the records the term finds, through the directory's own search. */
	search: (records: T[], term: string, translations: TranslationFunctions) => T[];
	/** the host's run, which runs an act the record admits and says whether it ran. */
	run: (actId: string, record: T) => boolean;
};

/** whether an act applies to a record, as every projection in `design/acts.ts` reads it. */
const applies = <T>(act: RecordAct<T>, record: T) => act.appliesTo?.(record) ?? true;

function offering<T>(
	acts: readonly RecordAct<T>[],
	records: () => T[],
	described: Described<T>
): OrganizationOffering {
	return {
		offered: (translations, isAppleKeyboard) =>
			toPaletteActs(
				acts.filter((act) => records().some((record) => applies(act, record))),
				translations,
				isAppleKeyboard
			),

		find: (term, asked) => ({
			get data(): PaletteMatch[] {
				const act = acts.find((declared) => declared.id === asked());

				// found only while one of these acts is asking: a member or a workspace is opened
				// from its settings directory, and the menu reaches them to run an act on them.
				if (!act) {
					return [];
				}

				const translations = get(LL);
				const admitting = records().filter((record) => applies(act, record));

				return described.search(admitting, term(), translations).map((record) => ({
					id: described.idOf(record),
					label: described.labelOf(record, translations),
					hint: described.hintOf(record, translations),
					unavailable: act.unavailable?.(record, translations)
				}));
			}
		}),

		// the record is read again at the moment it is run, so a gate that changed while the menu
		// was open is the one that answers; a refusal is said with a sentence, as a contract's is.
		runOn: (actId, recordId) => {
			const translations = get(LL);
			const record = records().find((candidate) => described.idOf(candidate) === recordId);

			if (!record) {
				showErrorSentence(translations.common.errors.notFound());

				return;
			}

			const verb = toPaletteVerbs(acts, record, translations, usesAppleKeyboard()).find(
				(offered) => offered.id === actId
			);

			if (!verb) {
				const act = acts.find((declared) => declared.id === actId);

				showErrorSentence(
					translations.common.ui.commandPaletteActDoesNotApply({
						act: act?.label(translations) ?? actId,
						record: described.labelOf(record, translations)
					})
				);

				return;
			}

			if (verb.unavailable) {
				showErrorSentence(verb.unavailable);

				return;
			}

			described.run(actId, record);
		}
	};
}

/** what a role is called in the reader's language, as the members directory calls it. */
const roleLabel = (role: string, translations: TranslationFunctions) =>
	({
		owner: translations.layout.signIn.roleOwner(),
		administrator: translations.layout.signIn.roleAdministrator(),
		member: translations.layout.signIn.roleMember()
	})[role] ?? role;

/**
 * The member and workspace acts, as the command menu offers them.
 *
 * A hook: it reads the session, the members, where each stands and the workspace open here, and
 * the three that only an act needs are read only while `enabled` says so, which is while the menu
 * is open. They are the settings route's own queries, so an open menu reads their cache.
 */
export function useOrganizationOfferings(enabled: () => boolean) {
	const stateQuery = useFetchOrganizationState();
	const membersQuery = useFetchMembers(enabled);
	const standingsQuery = useFetchMemberStandings(enabled);
	const syncQuery = useFetchRemoteSyncState(enabled);

	const session = () => stateQuery.data?.session ?? null;

	const memberRecords = (): MemberActRecord[] => {
		const reader = session();

		if (!reader) {
			return [];
		}

		const members = membersQuery.data ?? [];
		const context = toMemberActContext(
			memberReaderOf(reader),
			members,
			standingsQuery.data ?? [],
			memberPending()
		);

		return members.map((member) => ({ member, context }));
	};

	const workspaceRecords = (): WorkspaceActRecord[] => {
		const reader = session();

		if (!reader) {
			return [];
		}

		const context = workspaceContextOf(reader, syncQuery.data?.workspace.remoteId ?? null);

		return reader.workspaces.map((workspace) => ({ workspace, context }));
	};

	return {
		member: offering(memberActs, memberRecords, {
			idOf: ({ member }) => member.id,
			labelOf: ({ member }) => member.username,
			hintOf: ({ member }, translations) => roleLabel(member.role, translations),
			search: (records, term, translations) => {
				const found = toMemberDirectory(
					records.map(({ member }) => member),
					term,
					null,
					(role) => roleLabel(role, translations)
				);

				return records.filter((record) => found.includes(record.member));
			},
			run: (actId, record) => memberHost.run(actId as MemberActId, record)
		}),
		workspace: offering(workspaceActs, workspaceRecords, {
			idOf: ({ workspace }) => workspace.id,
			labelOf: ({ workspace }) => workspace.name,
			// the one open here is marked in the rail's own word for it, as its card marks it.
			hintOf: ({ workspace, context }, translations) =>
				workspace.id === context.openWorkspaceId ? translations.layout.workspaceMenu.open() : '',
			search: (records, term) => {
				const found = toWorkspaceDirectory(
					records.map(({ workspace }) => workspace),
					term,
					null,
					() => 0
				);

				return records.filter((record) => found.includes(record.workspace));
			},
			run: (actId, record) => workspaceHost.run(actId as WorkspaceActId, record)
		})
	};
}
