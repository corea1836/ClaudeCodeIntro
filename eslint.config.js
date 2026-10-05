import js from '@eslint/js';
import globals from 'globals';
import html from 'eslint-plugin-html';

export default [
  { ignores: ['node_modules/', '.claude/'] },
  js.configs.recommended,
  {
    rules: {
      eqeqeq: 'error',
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
  // index.html의 인라인 <script>는 브라우저 전역에서 클래식 스크립트로 실행된다
  {
    files: ['**/*.html'],
    plugins: { html },
    languageOptions: { sourceType: 'script', globals: globals.browser },
  },
  {
    files: ['**/*.js'],
    languageOptions: { globals: globals.node },
  },
];
