import { defineConfig, globalIgnores } from 'eslint/config'
import js from '@eslint/js'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import reactHooks from 'eslint-plugin-react-hooks'
import simpleImportSort from 'eslint-plugin-simple-import-sort'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier/flat'

const importSort = {
  plugins: { 'simple-import-sort': simpleImportSort },
  rules: {
    'simple-import-sort/imports': 'error',
    'simple-import-sort/exports': 'error',
  },
}

export default defineConfig(
  globalIgnores(['dist', 'dev-dist', 'coverage', 'node_modules', '.claude', '.playwright-mcp']),

  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['eslint.config.js'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // 템플릿 리터럴에 숫자 허용. 이 앱의 위반 57건 전부가 number였고(개수·퍼센트·
      // 등급 라벨), 규칙이 실제로 막으려는 위험(객체가 "[object Object]"로,
      // null/undefined가 "null"로 새는 것)은 그대로 금지된 상태로 남는다.
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      // `const { id: _id, ...rest } = row` — 필드를 의도적으로 떼어내는 관용구.
      // 밑줄 접두어만 예외로 두고 나머지 미사용 변수는 계속 오류다.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  },

  // 앱 코드 (브라우저)
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    ...importSort,
  },

  // React 훅 규칙은 커스텀 훅이 있는 .ts에도 적용한다
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat['recommended-latest']],
  },

  // JSX 접근성은 JSX가 있는 파일만
  {
    files: ['src/**/*.tsx'],
    extends: [jsxA11y.flatConfigs.strict],
  },

  // 테스트·빌드 설정 (노드 전역)
  {
    files: [
      'tests/**/*.ts',
      'e2e/**/*.ts',
      'scripts/**/*.ts',
      'vite.config.ts',
      'playwright.config.ts',
    ],
    languageOptions: { globals: globals.node },
    ...importSort,
  },

  // 이 설정 파일 자체는 앱 tsconfig 범위 밖이고, eslint-plugin-jsx-a11y는 타입
  // 선언을 제공하지 않아 플러그인 객체가 any로 들어온다. 앱 코드의 no-unsafe-*
  // 검사를 약화시키지 않기 위해 이 파일만 타입 인식 규칙에서 제외한다.
  {
    files: ['eslint.config.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },

  prettier,
)
