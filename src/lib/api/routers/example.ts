import { tauri } from '$lib/api/tauri';
import { procedure, router } from '$lib/api/trpc';
import z from 'zod';

export default router({
	greet: procedure.public.input(z.string()).query(async ({ input }) => {
		return await tauri.example.greet(input);
	})
});
