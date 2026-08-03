import { appRouter } from './router';
import { caller, context } from './trpc';

export default caller(appRouter)(await context());
