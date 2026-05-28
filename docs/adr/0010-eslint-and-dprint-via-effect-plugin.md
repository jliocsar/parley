# ESLint + dprint via @effect/eslint-plugin replace Biome

We replaced Biome (formatter + linter) with ESLint flat config running `typescript-eslint` (strict + stylistic, type-aware via project-service) plus `@effect/eslint-plugin`, whose `dprint` rule handles formatting and whose `no-import-from-barrel-package` rule forces `import * as X from 'effect/X'` over barrel imports across `effect` and every `@effect/*` package we depend on. The motivation is type-aware lint (`no-floating-promises`, `no-misused-promises`, `no-unnecessary-condition`) that Biome cannot express, and alignment with the Effect ecosystem's import conventions; we accept the perf regression in the per-turn Stop hook and the loss of `noExcessiveCognitiveComplexity` (replaced by ESLint core's `complexity`, which measures cyclomatic not cognitive).

## Considered Options

- **Keep Biome.** Fast, tuned, hooks already wired. Rejected because type-aware rules are not on Biome's roadmap and the Effect codebase has real `no-floating-promises`-class bugs that Biome can't catch.
- **Biome + ESLint side-by-side.** Run Biome for general lint/format, ESLint only for type-aware + Effect rules. Rejected: two ignore systems, two configs, doubled hook work, two linters fighting over the same files.
- **ESLint + Prettier.** The conventional pairing and what the Effect maintainers actually use on their own repo. Rejected because the entire point of the migration is to lean into `@effect/eslint-plugin`, and its `dprint` rule wants to own formatting — running Prettier alongside would mean disabling the one half of the plugin we care about.
- **ESLint + oxfmt.** Faster than dprint, similar config story. Rejected after settling on dprint-via-plugin: oxfmt is a separate toolchain with no relationship to the Effect plugin, and would mean running a standalone formatter alongside the lint pass instead of letting one ESLint invocation do everything.
- **Standalone dprint CLI + ESLint.** Same formatter, faster than the in-rule version. Held in reserve as the escape hatch if Stop-hook latency becomes intolerable.

## Consequences

- **Stop hook gets slower.** Per-turn lint over touched files goes from <100ms (Biome) to ~1–3s cold (ESLint with type-aware rules + the dprint rule diffing files in-memory). The existing post-edit→stop batching design (single deduped run per turn) is preserved unchanged; only the linter binary swaps.
- **Pre-commit pays the same cost as `tsc`.** Type-aware ESLint runs the full TS program; `bun run typecheck` already does this. We keep both — typecheck is still cheaper to fail-fast on type errors than letting ESLint surface them as parser errors.
- **New `.husky/pre-push` hook** runs `bunx eslint .` over the entire repo to catch drift on files the per-file pre-commit pass never saw.
- **`noExcessiveCognitiveComplexity` is lost.** Replaced by ESLint core `complexity` (cyclomatic). Threshold needs re-tuning — cognitive 15 and cyclomatic 15 measure different things, so the set of "too complex" functions will shift on the first pass.
- **Barrel imports refactored.** All `import { ... } from 'effect'` and `from '@effect/*'` become `import * as X from 'effect/X'`. Auto-fix only handles single-specifier imports (28 of 53 `effect` cases); the rest split manually. `.agents/rules/server-state-mutable-hashmap.md`'s canonical example is updated to match.
- **`code-style.md` rewritten.** Biome-specific subsections (manual-run commands, biome-ignore audit-trail format) become ESLint equivalents. Vertical-spacing rules carry over unchanged — dprint preserves single blank lines and collapses 2+ → 1 the same way Biome's formatter did, never inserting blanks Claude didn't write.
- **Escape hatch if perf is intolerable.** Drop the `@effect/dprint` rule, run `dprint fmt` standalone via a pre-commit hook + editor integration, keep ESLint for lint only. Loses the "one ESLint invocation does everything" purity but recovers most of the speed.
