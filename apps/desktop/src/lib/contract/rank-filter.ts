import type { Pathname } from '$app/types';
import { CONTRACT_RANKS, type ContractRank } from '$lib/contract/rank';
import type { ChoiceFilter, FilterSelection } from '$lib/design/filter';

/**
 * CONTRACT RANK FILTER
 *
 * How a contracts list comes to be narrowed to one attention rank: the filter a list declares,
 * and the parameter a link carries when a surface sends the reader here already narrowed.
 *
 * Three surfaces list contracts — the directory, a tenant's page and a unit's. Only the
 * directory offered this narrowing and it built the control by hand; the other two showed every
 * contract the record held with no way to ask which needed attention. A rank means the same
 * thing on all three, so it is declared once here rather than three times there.
 */

/** which filter a chosen rank is held under, in a list's selection. */
export const RANK_FILTER_ID = 'rank';

/** the translation key each rank reads under, which is its own name in camel case. */
function toRankKey(rank: ContractRank): 'overdue' | 'owing' | 'endingSoon' {
	return rank === 'ending-soon' ? 'endingSoon' : rank;
}

/** The rank filter, as a contracts list declares it. */
export const RANK_FILTER: ChoiceFilter = {
	kind: 'choice',
	id: RANK_FILTER_ID,
	label: (translations) => translations.common.labels.rank(),
	options: CONTRACT_RANKS.map((rank) => ({
		id: rank,
		label: (translations) => translations.contracts.ranks[toRankKey(rank)]()
	}))
};

/**
 * The rank a selection is narrowed to, or nothing.
 *
 * Read through the vocabulary rather than trusted: a selection is a plain record of strings, and
 * what reaches the read has to be a rank the procedure will accept.
 */
export function toChosenRank(selection: FilterSelection): ContractRank | undefined {
	return CONTRACT_RANKS.find((rank) => rank === selection[RANK_FILTER_ID]);
}

/**
 * The search parameter a link carries to ask the contracts list to open narrowed to one
 * attention rank.
 *
 * A list owns its own narrowing, so nothing outside it can set that filter directly. The rank
 * travels in the URL instead: a surface that ranked a contract sends the reader to the list
 * carrying this parameter, and the list applies it on arrival. That is what makes a way
 * through from a rank land on every contract of that rank rather than on every contract.
 */
export const CONTRACT_RANK_PARAM = 'rank';

/** `path`, asking the contracts list it addresses to open narrowed to `rank`. */
export function withContractRank<T extends Pathname>(
	path: T,
	rank: ContractRank
): `${T}?${typeof CONTRACT_RANK_PARAM}=${ContractRank}` {
	return `${path}?${CONTRACT_RANK_PARAM}=${rank}`;
}

/**
 * The rank `url` asks for, or `undefined` where it asks for none.
 *
 * A value outside the vocabulary reads as none rather than as an error: the parameter is part
 * of a URL a reader can edit, and a mistyped rank should leave the list showing everything
 * rather than showing nothing.
 */
export function readContractRank(url: URL): ContractRank | undefined {
	const requested = url.searchParams.get(CONTRACT_RANK_PARAM);

	return CONTRACT_RANKS.find((rank) => rank === requested);
}

/**
 * The narrowing a contracts list opens on, read off the URL it was opened by.
 *
 * **The whole selection rather than a change to one**, and that is the point rather than a
 * convenience: what the list opens narrowed to is decided by the URL and by nothing the list is
 * already showing, so nothing here has to be handed the selection it produces. A consumer that
 * merged a rank into the current selection would be reading the state it writes, which is what
 * an effect cannot do — the directory did exactly that and looped until Svelte stopped it with
 * `effect_update_depth_exceeded` (#684).
 *
 * A URL asking for no rank, or for one outside the vocabulary, opens on nothing — which is
 * {@link readContractRank}'s promise that a mistyped rank leaves the list showing everything.
 */
export function toRankArrivalSelection(url: URL): FilterSelection {
	const requested = readContractRank(url);

	return requested ? { [RANK_FILTER_ID]: requested } : {};
}
