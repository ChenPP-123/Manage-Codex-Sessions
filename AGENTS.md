# Repository Guidelines

## Project Structure & Module Organization

Application code lives in `src/`. `cli.tsx` owns argument handling and process lifecycle, `App.tsx` renders the Ink interface, and `app-server-client.ts` contains all Codex App Server communication. Keep navigation rules in `navigation.ts`, batch behavior in `session-actions.ts`, and shared contracts in `types.ts`.

Tests live in `test/` and mirror source responsibilities. Protocol fixtures belong in `test/fixtures/`. TypeScript builds into `dist/`; never edit or commit generated output.

## Build, Test, and Development Commands

- `npm install` installs locked dependencies. Use Node.js 20 or newer.
- `npm run typecheck` runs strict TypeScript validation without producing files.
- `npm test` runs the Vitest suite once.
- `npm run build` compiles the executable and declarations into `dist/`.
- `npm install -g .` installs the built package as the global `mcs` command.
- `mcs --help` verifies the installed CLI without accessing session data.

Before submitting changes, run `npm run typecheck && npm test && npm run build`.

## Coding Style & Naming Conventions

Use TypeScript with two-space indentation, single quotes, semicolons, and explicit types at process or protocol boundaries. Follow `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`; do not weaken compiler settings to bypass errors.

Use `PascalCase` for React components and classes, `camelCase` for functions and variables, and descriptive kebab-case filenames except component files such as `App.tsx`. Prefer concrete modules over generic helpers. Comments should explain constraints or tradeoffs, not restate code. No formatter or linter is configured, so preserve the existing style manually.

## Testing Guidelines

Use Vitest and name files `*.test.ts`. Test protocol pagination, navigation boundaries, and batch failures in the corresponding test file. Use the fake App Server for mutation tests; automated tests must never archive or delete real Codex sessions. There is no numeric coverage threshold, but new branches and failure modes need focused tests.

## Commit & Pull Request Guidelines

The repository has no commit history yet. Use short, imperative Conventional Commit messages, for example `feat: add archived session column` or `fix: retain failed selections`.

Pull requests should explain the user-visible change, list verification commands, and link relevant issues. Include a terminal screenshot for layout changes. Call out destructive-operation or Codex protocol changes explicitly.

## Security & Integration Notes

Use the documented stdio App Server methods. Do not read or modify `~/.codex` databases or rollout files directly. Preserve delete confirmation and clear error reporting when changing session actions.
