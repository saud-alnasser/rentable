import complex from './routers/complex';
import contract from './routers/contract';
import database from './routers/database';
import example from './routers/example';
import tenant from './routers/tenant';
import window from './routers/window';
import { caller, context, router } from './trpc';

export default caller(
	router({
		database,
		tenant,
		complex,
		contract,
		example,
		window
	})
)(await context());
