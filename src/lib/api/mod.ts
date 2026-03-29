import app from './routers/app';
import complex from './routers/complex';
import contract from './routers/contract';
import tenant from './routers/tenant';
import { caller, context, router } from './trpc';

export default caller(
	router({
		app,
		tenant,
		complex,
		contract
	})
)(await context());
