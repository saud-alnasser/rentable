import { tauri } from '$lib/api/tauri';
import { procedure, router } from '$lib/api/trpc';

export default router({
	show: procedure.public.query(async () => {
		await tauri.window.show();
	}),
	minimize: procedure.public.mutation(async () => {
		await tauri.window.minimize();
	}),
	toggleMaximize: procedure.public.mutation(async () => {
		await tauri.window.toggleMaximize();
	}),
	startDragging: procedure.public.mutation(async () => {
		await tauri.window.startDragging();
	}),
	close: procedure.public.mutation(async () => {
		await tauri.window.close();
	})
});
