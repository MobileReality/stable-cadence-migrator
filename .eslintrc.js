module.exports = {
  root: true,
  env: {
    node: true,
    jest: true,
  },
  extends: [
    '@mobile-reality/eslint-config/node-javascript',
    'plugin:prettier/recommended',
  ],
  overrides: [
    {
      files: ['test/**/*.test.ts'],
      extends: ['@mobile-reality/eslint-config/configs/jest'],
    },
  ],
  rules: {
    'no-underscore-dangle': 'off',
    complexity: 'off',
    'prefer-destructuring': 'off',
    'prefer-regex-literals': 'off',
    'unicorn/no-await-expression-member': 'off',
    eqeqeq: 'off',
    'unicorn/prefer-logical-operator-over-ternary': 'off',
    'unicorn/consistent-destructuring': 'off',
    'no-bitwise': 'off',
    'func-names': 'off',
    'no-param-reassign': 'off',
    // TODO remove unneeded exceptions
    'require-await': 'off',
    'unicorn/no-zero-fractions': 'off',
    'unicorn/numeric-separators-style': 'off',
    'unicorn/new-for-builtins': 'off',
    'one-var': 'off',
    'no-unused-vars': 'off',
    // NtTestAlert: I hate these
    'dot-notation': 'off',
    'line-comment-position': 'off',
    'no-inline-comments': 'off',
    'prettier/prettier': [
      'error',
      {
        trailingComma: 'all',
        tabWidth: 2,
        eslintIntegration: true,
        printWidth: 80,
      },
    ],
  },
};
