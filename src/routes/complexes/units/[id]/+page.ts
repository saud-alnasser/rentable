import { base } from '$app/paths';
import { redirect } from '@sveltejs/kit';

export const prerender = false;
export const ssr = false;

export function load({ params, url }: { params: { id: string }; url: URL }) {
	const searchParams = new URLSearchParams(url.searchParams);
	searchParams.set('section', 'units');

	throw redirect(307, `${base}/complexes/${params.id}?${searchParams.toString()}`);
}
