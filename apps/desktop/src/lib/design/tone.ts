import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
import InfoIcon from '@lucide/svelte/icons/info';
import OctagonXIcon from '@lucide/svelte/icons/octagon-x';
import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
import type { Component } from 'svelte';
import { tv } from 'tailwind-variants';

/**
 * TONE
 *
 * what kind of event a surface is reporting, in one vocabulary for the whole application.
 *
 * **It is a consolidation rather than a new idea.** Six vocabularies for this already existed and
 * no two of them agreed: the callout said `error | info | success | warning`, the standalone
 * surface said `neutral | notice | failure`, the record action control said `neutral | destructive`
 * and already called it a tone, the badge said `destructive`, the toaster carried its own four
 * uncoloured, and a dead `alert` primitive carried a sixth set with no callers at all. The
 * callout's names win because seventeen call sites already speak them and everything else was two
 * or three.
 *
 * **What a count cell and a status glyph say is not this.** `running | settled | money` reports a
 * condition of the domain rather than a kind of event, which is why the two of them agree about
 * what blue means and neither answers to `info` — and `money` is not a state at all. The boundary
 * is [[rules/interface]] under *Tone*, because it is the kind of thing that gets re-decided.
 *
 * **`neutral` is a tone and not the absence of one.** Every surface that can report a kind says
 * which, and most say neutral — a screen that declares nothing is indistinguishable from a screen
 * whose author never considered the question, and the two should not look the same in the source.
 *
 * The colours are `@rentable/design/tokens.css`'s, which is the other half of this: `info` and
 * `warning` were raw palette values living inside the callout primitive, so two of the four
 * things a callout could say did not answer to this application's palette at all.
 */
export const TONES = ['neutral', 'info', 'success', 'warning', 'error'] as const;

export type Tone = (typeof TONES)[number];

/**
 * the classes each tone lends, as three independent pieces.
 *
 * **Three slots rather than one recipe, because the treatments genuinely differ.** A callout is a
 * bordered box, the standalone surface's band is a full-bleed wash with no border, and a glyph on
 * its own is text colour and nothing else. One combined string would have every caller overriding
 * part of it, which is a shared decision that has stopped being shared.
 */
export const tone = tv({
	slots: {
		/** the glyph and the words, where the tone is carried by colour alone. */
		text: '',
		/** a tinted ground, for a band or a box. */
		wash: '',
		/** the edge, for the treatments that have one. */
		edge: ''
	},
	variants: {
		tone: {
			neutral: { text: 'text-foreground', wash: 'bg-muted', edge: 'border-border' },
			info: { text: 'text-info', wash: 'bg-info/10', edge: 'border-info/30' },
			success: { text: 'text-success', wash: 'bg-success/10', edge: 'border-success/30' },
			warning: { text: 'text-warning', wash: 'bg-warning/10', edge: 'border-warning/30' },
			error: {
				text: 'text-destructive',
				wash: 'bg-destructive/10',
				edge: 'border-destructive/30'
			}
		}
	},
	defaultVariants: {
		tone: 'neutral'
	}
});

/**
 * the glyph a tone brings when a surface does not name its own.
 *
 * **A caller may override it, and update recovery is why.** That screen is a `info` in tone and a
 * download in subject, and an information circle on it would say *here is a fact* where a download
 * glyph says *an update was being installed*. The tone decides the colour; the subject decides the
 * picture, whenever the surface has one.
 *
 * `neutral` has none: a screen reporting nothing in particular has nothing in particular to draw,
 * and a glyph there would be decoration.
 */
export const toneIcon: Record<Tone, Component<{ class?: string }> | null> = {
	neutral: null,
	info: InfoIcon,
	success: CircleCheckIcon,
	warning: TriangleAlertIcon,
	error: OctagonXIcon
};
