<script lang="ts">
	import api from '$lib/api/mod';
	import { Button } from '$lib/common/components/fragments/button';
	import MinusIcon from '@lucide/svelte/icons/minus';
	import SquareIcon from '@lucide/svelte/icons/square';
	import XIcon from '@lucide/svelte/icons/x';

	function startDragging(event: MouseEvent) {
		if (event.button !== 0) {
			return;
		}

		void api.window.startDragging();
	}

	function stopEventPropagation(event: MouseEvent) {
		event.stopPropagation();
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	onmousedown={startDragging}
	ondblclick={() => void api.window.toggleMaximize()}
	class="flex cursor-grab items-center gap-2 border-b border-border/60 bg-background/70 px-3 py-3 backdrop-blur-xl select-none active:cursor-grabbing"
>
	<div class="flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5">
		<div class="size-2 rounded-full bg-primary/70 shadow-sm"></div>
		<span class="truncate text-sm font-medium tracking-wide text-foreground/90">rentable</span>
	</div>

	<div
		class="pointer-events-auto relative z-10 flex shrink-0 items-center gap-1"
		onmousedown={stopEventPropagation}
		ondblclick={stopEventPropagation}
	>
		<Button
			variant="ghost"
			size="icon-sm"
			class="rounded-full border border-transparent text-muted-foreground hover:border-border/60 hover:bg-background/80 hover:text-foreground"
			aria-label="Minimize window"
			onclick={() => void api.window.minimize()}
		>
			<MinusIcon class="size-4" />
		</Button>

		<Button
			variant="ghost"
			size="icon-sm"
			class="rounded-full border border-transparent text-muted-foreground hover:border-border/60 hover:bg-background/80 hover:text-foreground"
			aria-label="Toggle maximize window"
			onclick={() => void api.window.toggleMaximize()}
		>
			<SquareIcon class="size-3.5" />
		</Button>

		<Button
			variant="ghost"
			size="icon-sm"
			class="rounded-full border border-transparent text-muted-foreground hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
			aria-label="Close window"
			onclick={() => void api.window.close()}
		>
			<XIcon class="size-4" />
		</Button>
	</div>
</div>
