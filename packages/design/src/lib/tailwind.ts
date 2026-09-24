import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * The merge taught the token layer's shape and elevation, which it cannot read for itself. Left to
 * its defaults it takes `shadow-raised` for a shadow colour, so a later `shadow-overlay` would
 * not replace it and a later colour would drop it, and `rounded-inherit` would sit beside a step
 * rather than replace it.
 */
const twMerge = extendTailwindMerge({
	extend: {
		theme: {
			radius: ['inherit'],
			shadow: ['raised', 'overlay'],
			'inset-shadow': ['sunken']
		}
	}
});

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChild<T> = T extends { child?: any } ? Omit<T, 'child'> : T;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChildren<T> = T extends { children?: any } ? Omit<T, 'children'> : T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & { ref?: U | null };
