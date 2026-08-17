import type { Pathname } from '$app/types';
import { CONTRACT_RANKS, type ContractRank } from '$lib/contract/rank';

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
