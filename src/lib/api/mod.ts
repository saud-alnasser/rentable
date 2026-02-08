import example from './routers/example';
import window from './routers/window';
import { caller, context, router } from './trpc';

export default caller(
	router({
		example,
		window
	})
)(await context());
