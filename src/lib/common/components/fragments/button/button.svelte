<script lang="ts" module>
	/* eslint-disable svelte/no-navigation-without-resolve */
	import { cn, type WithElementRef } from '$lib/common/utils/tailwind.js';
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';
	import { tv, type VariantProps } from 'tailwind-variants';

	export const buttonVariants = tv({
		base: "focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl border border-transparent text-sm font-medium tracking-[0.01em] whitespace-nowrap transition-[background-color,border-color,color,box-shadow] duration-200 outline-none focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
		variants: {
			variant: {
				default:
					'border-primary/20 bg-primary/90 text-primary-foreground shadow-sm shadow-primary/10 hover:bg-primary',
				destructive:
					'border-destructive/30 bg-destructive text-white shadow-sm shadow-destructive/10 hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60',
				outline:
					'border-border/70 bg-background/52 text-foreground shadow-xs backdrop-blur-sm hover:border-border hover:bg-background/68 dark:bg-input/18 dark:border-input dark:hover:bg-input/28',
				secondary:
					'border-border/60 bg-secondary/70 text-secondary-foreground shadow-xs backdrop-blur-sm hover:bg-secondary/82',
				ghost:
					'border-transparent text-muted-foreground hover:bg-accent/70 hover:text-accent-foreground dark:hover:bg-accent/50',
				link: 'text-primary underline-offset-4 hover:underline'
			},
			size: {
				default: 'h-10 px-4 py-2 has-[>svg]:px-3',
				sm: 'h-9 gap-1.5 px-3.5 has-[>svg]:px-3',
				lg: 'h-11 px-6 has-[>svg]:px-4',
				icon: 'size-10',
				'icon-sm': 'size-9',
				'icon-lg': 'size-11'
			}
		},
		defaultVariants: {
			variant: 'default',
			size: 'default'
		}
	});

	export type ButtonVariant = VariantProps<typeof buttonVariants>['variant'];
	export type ButtonSize = VariantProps<typeof buttonVariants>['size'];

	export type ButtonProps = WithElementRef<HTMLButtonAttributes> &
		WithElementRef<HTMLAnchorAttributes> & {
			variant?: ButtonVariant;
			size?: ButtonSize;
		};
</script>

<script lang="ts">
	let {
		class: className,
		variant = 'default',
		size = 'default',
		ref = $bindable(null),
		href = undefined,
		type = 'button',
		disabled,
		children,
		...restProps
	}: ButtonProps = $props();
</script>

{#if href}
	<a
		bind:this={ref}
		data-slot="button"
		class={cn(buttonVariants({ variant, size }), className)}
		href={disabled ? undefined : href}
		aria-disabled={disabled}
		role={disabled ? 'link' : undefined}
		tabindex={disabled ? -1 : undefined}
		{...restProps}
	>
		{@render children?.()}
	</a>
{:else}
	<button
		bind:this={ref}
		data-slot="button"
		class={cn(buttonVariants({ variant, size }), className)}
		{type}
		{disabled}
		{...restProps}
	>
		{@render children?.()}
	</button>
{/if}
