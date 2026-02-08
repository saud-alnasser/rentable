import { tauri } from '$lib/api/tauri';
import { procedure, router } from '$lib/api/trpc';

export default router({
	show: procedure.public.query(async () => {
		await tauri.window.show();
	})
});
