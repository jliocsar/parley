<rule-code-style>

Bun + TypeScript. ESLint owns formatting and linting; the `@effect/dprint` rule (wrapping the dprint-typescript formatter) handles formatting from inside ESLint.

<must-do>

- Use ESLint flat config at the repo root (`eslint.config.mjs`). Stack: `@eslint/js` recommended + `typescript-eslint` strict-type-checked + stylistic-type-checked (via project-service) + `@effect/eslint-plugin` (the `dprint` rule + `no-import-from-barrel-package`). dprint config locked to: 2-space indent, single quotes, no semicolons (`semiColons: "asi"`), trailing commas on multi-line, 100-col line width, `arrowFunction.useParentheses: "force"`.
- The PostToolUse hook at `.claude/hooks/lint-post-edit.sh` queues each touched file; the Stop hook at `.claude/hooks/lint-stop.sh` runs one `eslint` over the deduped set at turn end and blocks the turn on lint failure. Let it run — when it blocks, fix the reported issue rather than disabling the hook.
- Imports from `effect` and any `@effect/*` package use the namespace form: `import * as Effect from 'effect/Effect'`, never `import { Effect } from 'effect'`. The `@effect/no-import-from-barrel-package` rule enforces this; type-only imports (`import type { X } from 'effect'`) are exempt and may use barrel form.

</must-do>

<readability>

- `curly` (always brace) — `if`/`else`/`while`/`for` always use braces. No single-line bodies.
- `no-nested-ternary` — ternaries don't nest. Lift to named locals or `if`/`else`.
- `prefer-template` — string concat → template literal.
- `@typescript-eslint/array-type` (`default: 'array'`) — prefer `T[]` over `Array<T>`.
- `complexity` — cyclomatic threshold 15. Refactor into helpers / lookup tables / early returns. When a function genuinely needs the complexity (security boundaries, protocol state machines), suppress per-line with `// eslint-disable-next-line complexity -- <audit-trail rationale>` and leave it alone.
- `max-lines-per-function` — threshold 200, generous to accommodate Effect.fn generator bodies. Truly large bodies still trip; refactor into composed Effects when that happens.

</readability>

<vertical-spacing>

dprint preserves author-written blanks (collapses 2+ → 1) but never inserts them, so a single blank line at the right spot survives `eslint --fix`. The rules below are Claude-enforced on edit — apply them on every file you write or modify.

**Core rule: a blank line separates every block-like statement from its non-block neighbours, and precedes every `return` that isn't the first statement in its containing block.**

Block-like = `if` chain, `for` / `for...of` / `for...in`, `while` / `do...while`, `switch`, `try`/`catch`/`finally`, function declaration, class declaration, and a multi-line arrow/function expression assigned at statement level.

**Required blanks:**

- Between two adjacent block-like statements at the same scope.
- Between a non-block statement and an adjacent block-like statement (either order).
- Before `return` when any statement precedes it in the same block.
- Between adjacent top-level `function` and/or `class` declarations (always).
- Between top-level declarations of different kinds (e.g. `const` then `function`).
- Between the import block and the first non-import statement.

**Exceptions (no blank required):**

- Adjacent `case` / `default` clauses inside a `switch` — they're labels, not blocks.
- Continuation arms of the same statement: `} else {`, `} else if (...) {`, `} catch (e) {`, `} finally {`, `} while (cond)`. No blank between the closing brace and the keyword.
- First statement inside a fresh block (no leading blank after `{`).
- Last statement before `}` (no trailing blank before `}`).
- Consecutive `import` lines.
- Consecutive simple one-line `const` / `let` bindings at the same scope.
- Consecutive one-line `type` aliases or single-line `interface`s.
- Single-statement function/method body (no blank between `{` and the lone `return` / expression).
- A guard at the top of a function (`if (!x) { return ... }`) still needs a blank line **after** it, before the rest of the body.

**Examples**

```ts
// bad
const foo = 10
if (foo > 5) {
  log('hi')
}
const bar = foo + 20
return bar

// good
const foo = 10

if (foo > 5) {
  log('hi')
}

const bar = foo + 20

return bar
```

```ts
// bad — adjacent decls flush together
function foo() { /* … */ }
function bar() { /* … */ }
class Scheduler { /* … */ }
class Consumer { /* … */ }

// good
function foo() { /* … */ }

function bar() { /* … */ }

class Scheduler { /* … */ }

class Consumer { /* … */ }
```

```ts
// bad — blanks between continuation arms
if (cond) {
  …
}

else {
  …
}

// good
if (cond) {
  …
} else {
  …
}
```

```ts
// allowed — consecutive simple bindings, no blanks needed
const a = 1
const b = 2
const c = a + b
```

```ts
// allowed — single-statement body, no blank
function double(n: number) {
  return n * 2
}
```

If you ever find this rule fighting a real edit, document the exception here rather than skipping the blanks silently — the spec evolves.

</vertical-spacing>

<must-not-do>

- Do not add a frontend toolchain (Vite, React, Tailwind, shadcn). If you find yourself reaching for one, you're in the wrong repo.
- Do not commit code that fails `bunx eslint .`. The pre-commit hook auto-fixes staged files; the pre-push hook runs full-repo as a safety net.
- Do not import barrel-style from `effect` or `@effect/*` for value imports — see the `no-import-from-barrel-package` rule.
- Ask before adding dependencies — see `rules/donts.md`.

</must-not-do>

<manual-run>

```bash
bunx eslint . --fix  # format + lint + fix what's safe
bunx eslint .        # format + lint, no writes
```

</manual-run>

</rule-code-style>
