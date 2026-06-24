export default {
  '*.{ts,js,mjs}': ['prettier --write', 'eslint --max-warnings=0 --fix'],
  '*.{json,md,yml,yaml}': ['prettier --write']
};
