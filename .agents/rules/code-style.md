<rule-code-style>

Bun + TypeScript. Biome owns formatting and linting.

<must-do>

- Use Biome for formatting and lint. Config: `biome.json`. Settings: 2-space indent, single quotes, no semicolons (`asNeeded`), trailing commas, 100-col line width. `arrowParentheses: always`.
- The PostToolUse hook at `.claude/hooks/biome-post-edit.sh` runs `biome check --write --unsafe` on each edited file and blocks the turn on lint failure. Let it run — when it blocks, fix the reported issue rather than disabling the hook.

</must-do>

<readability>

- `style/useBlockStatements` — always brace `if`/`else`/`while`/`for`. No single-line bodies.
- `style/noNestedTernary` — ternaries don't nest. Lift to named locals or `if`/`else`.
- `style/useTemplate`, `style/useNumberNamespace`, `style/useConsistentArrayType` — string concat → template literal, `parseInt` → `Number.parseInt`, prefer `T[]` over `Array<T>`.
- `complexity/noExcessiveCognitiveComplexity` — threshold 15. Refactor into helpers / lookup tables / early returns. Two security-critical functions (`authenticateHttp`, `handleSendDirectMessage`) carry a `// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: security boundary, see comment above` with an audit-trail rationale — leave those alone.

</readability>

<vertical-spacing>

Biome 2.4 has no `padding-line-between-statements` equivalent and its GritQL plugins can't match adjacent statements. Biome's formatter *preserves* author-written blanks (collapses 2+ → 1) but never inserts them, so a single blank line at the right spot survives `biome check --write`. The rules below are Claude-enforced on edit — apply them on every file you write or modify.

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
- Do not commit code that fails `bun x biome check`. The hook normally catches it; running `bun x biome check --write .` manually before committing is fine.
- Ask before adding dependencies — see `rules/donts.md`.

</must-not-do>

<manual-run>

```bash
bun x biome check --write . # format + lint + fix what's safe
bun x biome check .         # format + lint, no writes
bun x biome lint .          # lint only
```

</manual-run>

</rule-code-style>
