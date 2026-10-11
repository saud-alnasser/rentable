// The migrations `./vite.js` hands the staged database, as SQL text in the order they apply.
declare module 'virtual:stage-migrations' {
	const migrations: string[];
	export default migrations;
}
