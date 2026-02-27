<script lang="ts" module>
	import { cn } from '$lib/common/utils/tailwind';
	import type { HTMLAttributes } from 'svelte/elements';
	import { tv, type VariantProps } from 'tailwind-variants';

	export const calloutVariants = tv({
		base: 'rounded-md border p-3 text-sm',
		variants: {
			variant: {
				error: 'border-destructive/30 bg-destructive/10 text-destructive',
				info: 'border-blue-300/30 bg-blue-300/10 text-blue-300',
				success: 'border-green-300/30 bg-green-300/10 text-green-300',
				warning: 'border-amber-300/30 bg-amber-300/10 text-amber-300'
			}
		}
	});

	export type CalloutVariant = VariantProps<typeof calloutVariants>['variant'];

	export type CalloutProps = HTMLAttributes<HTMLDivElement> & VariantProps<typeof calloutVariants>;
</script>

<script lang="ts">
	let { class: className, variant, children, ...restProps }: CalloutProps = $props();
</script>

<div class={cn(calloutVariants({ variant }), className)} {...restProps}>
	{@render children?.()}
</div>
