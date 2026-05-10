# Contributing to FLOSMOSIS / WOHJO

## Pre-commit hooks (CRACK 198)

Pre-commit hooks run automatically on every `git commit`. They catch formatting, type, and security issues before they reach the remote.

### What runs

| Check                                               | Tool               | Behaviour                                                                        |
| --------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------- |
| ESLint (changed .ts/.tsx/.js files)                 | `eslint --fix`     | Auto-fixes what it can. Fails commit on errors (not warnings).                   |
| Prettier formatting (changed source + config files) | `prettier --write` | Auto-formats and re-stages the file.                                             |
| TypeScript typecheck                                | `tsc --noEmit`     | Full project check. Fails on any type error.                                     |
| .env file guard                                     | shell grep         | Aborts if any `.env*` file is staged.                                            |
| Merge conflict marker guard                         | shell grep         | Aborts if a line starting with seven `<` characters is found in any staged file. |

### Setup

Hooks install automatically on `npm install` via the `prepare` script (husky). If you cloned without running install:

```sh
npm install
```

That's it. No manual steps.

### Bypassing in an emergency

```sh
git commit --no-verify -m "emergency: <reason>"
```

Use sparingly. A PR description must explain why the bypass was necessary. Do not use `--no-verify` to avoid fixing a real problem — fix the problem.

### ESLint warnings vs errors

Warnings do not fail commits. The following rules are intentionally set to `warn` until a scheduled refactor closes them (tracked in `eslint.config.mjs`):

- `react-hooks/set-state-in-effect`
- `react-hooks/immutability`
- `react-hooks/purity`
- `react-hooks/preserve-manual-memoization`

Do not convert these to errors without Lauren's explicit approval — 13 existing call sites would fail CI.

### Prettier config

Prettier is configured in `.prettierrc`. Key settings: single quotes, semicolons, trailing commas, print width 100. If Prettier reformats a file you did not intend to change, stage the reformatted version — that is the correct state.

### TypeScript

The project runs with `"strict": true` in `tsconfig.json`. New code must pass typecheck. If you are fixing a strict-mode error that was pre-existing and not part of your change, commit it as a separate commit so the diff stays readable.
