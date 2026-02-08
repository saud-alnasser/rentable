import { initTRPC } from '@trpc/server';
import { ZodError } from 'zod';
import { db } from './database/mod';

/**
 * CONTEXT
 *
 * this section defines the context that is available to all procedures in the API.
 *
 * @returns a context object that can be passed to the any procedure in the API.
 */
export const context = async () => {
	return { db };
};

/**
 * INITIALIZER
 *
 * it holds everything related to trpc api with the configurations.
 */
const t = initTRPC.context<typeof context>().create({
	allowOutsideOfServer: true,
	errorFormatter({ shape, error }) {
		return {
			...shape,
			data: {
				...shape.data,
				cause: error.cause,
				zodError: error.cause instanceof ZodError ? error.cause.flatten() : null
			}
		};
	}
});

/**
 * ROUTES
 *
 * this section defines the router that contains routes that are available to the API.
 */
export const router = t.router;

/**
 * CALLER
 *
 * this section defines the caller that calls procedures in the API.
 */
export const caller = t.createCallerFactory;

/**
 * MIDDLEWARES that can be used in the API procedures.
 *
 * this object holds the defined middlewares that are available to the API procedures.
 * some of them are used by default in the procedures.
 */
export const middleware = {
	/**
	 * logs the request and the duration it took to fulfill it.
	 */
	log: t.middleware(async ({ path, next }) => {
		const start = Date.now();
		const result = await next();
		const end = Date.now();

		const duration = end - start;

		console.log(`[TRPC] ${path} executed in ${duration}ms`);

		return result;
	})
};

/**
 * PROCEDURES
 *
 * this section defines the procedures that are available to the API.
 */
export const procedure = {
	/**
	 * public
	 *
	 * this procedure is available to the public.
	 *
	 * middlewares: [log]
	 */
	public: t.procedure.use(middleware.log)
};
