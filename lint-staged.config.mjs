/** @type {import('lint-staged').Config} */
export default {
  '*.{ts,tsx}': () => 'npm run typecheck',
}
