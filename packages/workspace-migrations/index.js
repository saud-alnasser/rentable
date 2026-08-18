/**
 * Where the workspace migrations are, as a `file:` URL.
 *
 * **A URL rather than a path, and plain JavaScript rather than TypeScript**, because the two
 * consumers resolve it in different worlds: the control plane reads it from compiled output in
 * `build/`, and the desktop's test database reads it from source under `tsx`. `import.meta.url`
 * is correct in both without a build step of its own, which is what keeps this package a
 * directory of SQL and a pointer at it rather than something that has to be compiled first.
 */
export const workspaceMigrationsFolder = new URL('./migrations/', import.meta.url);
