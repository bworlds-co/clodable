# Claude Code mods: API cheat sheet (for Clodable)

Compact, exact reference for writing the Clodable mod (Publish band and pane, friendly tool rows,
guards, auto-save) for the Claude Desktop **Code** tab and the terminal.

- **Declarations:** Claude Code writes them beside the plugin, in
  `plugin/.claude-plugin/types/claude-code/index.d.ts` (and the built-in tools' inputs and results in
  `claude-code-tools/index.d.ts`), git-ignored: they're Anthropic's, so this repository doesn't copy
  them. This sheet was written against 2.1.296.
- **Desktop engine:** the Desktop app (2.31226.1 here) runs its **own** bundled Claude Code, 2.1.295
  on this machine (`~/Library/Application Support/Claude/claude-code/2.1.295`). I also generated
  2.1.295's declarations and diffed them. The only differences: a new `autoCompactWindow` field on
  agent specs, and doc text on `$.mcp.connect`. Everything below applies to both.
- **Minimum versions [docs]:** terminal v2.1.287, Desktop Code tab v2.1.286 (check with `/status`
  in a Code tab session). The docs' mods reference is "as of v2.1.290". When the docs and the d.ts
  disagree, trust the d.ts.
- **Source markers:** unmarked facts are quoted or derived from the 2.1.296 d.ts. **[run]** means
  I executed it here (CLI 2.1.296, `claude plugin validate/test`, tsc). **[docs]** means it comes
  from code.claude.com only. **[UNVERIFIED]** means inferred and never exercised live. Most Desktop
  runtime behavior is in that last category.

## 0. Regenerating the declarations [run]

- `/plugin-types` **does not exist in 2.1.296**. `claude -p "/plugin-types"` became an ordinary
  prompt: the model answered "There's no `/plugin-types` command in this session". It spent a model
  turn and wrote nothing.
- In 2.1.296 the engine writes the types itself "each time it loads a mod from a folder the person
  owns", but only in an **interactive** session. `claude -p "/x" --plugin-dir <mod>` writes nothing
  [run]. To have them:
  ```bash
  claude --plugin-dir ./plugin        # interactive; accept trust prompt; quit (Ctrl-C twice)
  ```
  I ran this headless with an `expect` script (spawn, send Enter on "trust", sleep 5, Ctrl-C x2),
  which takes about 10 s.
- The engine writes these files:
  ```
  <mod>/.claude-plugin/types/.gitignore                 "*"
  <mod>/.claude-plugin/types/tsconfig.json              jsx react + jsxFactory h; includes ../../{hooks,types,tests}
  <mod>/.claude-plugin/types/claude-code/index.d.ts     events, $, elements, 'claude-code/testing' (15,990 lines)
  <mod>/.claude-plugin/types/claude-code-tools/index.d.ts  BuiltinToolInputs / BuiltinToolResults of this build
  <mod>/.claude-plugin/types/claude-code-mcp/index.d.ts    McpToolInputs of servers connected at last save
  <mod>/.claude-plugin/types/<dependency>/index.d.ts    one per plugin.json "dependencies" entry
  <mod>/tsconfig.json   {"extends": "./.claude-plugin/types/tsconfig.json"}   (only if the mod has none)
  ```
- Type-check with `tsc -p <mod>` (needs TypeScript 5.4 or later). I used tsc 7.0.2 from the repo's
  `node_modules` and it passed [run].

## 1. Plugin layout

```
plugin/
├── .claude-plugin/plugin.json
├── hooks/hooks.json          {"modules": ["./register.tsx"]}
├── hooks/register.tsx        hooks module: .js .mjs .cjs .jsx .ts .mts .cts .tsx, always an ES module
├── types/index.d.ts          only for $.state values or a $ noun; named by plugin.json "types"
└── tests/*.test.ts(x)        run by `claude plugin test`
```

**`plugin.json`.** Mods add no required fields [docs].
| Field | Notes |
| :- | :- |
| `name` | Only required key; kebab-case. Validation fails names that look like Anthropic's (`claude-...`). |
| `version` | Installed copies are cached per version. Develop with `--plugin-dir` (or `CLAUDE_CODE_PLUGIN_DIRS`), not an installed copy. |
| `description`, `author: { name, email?, url? }` | Metadata. |
| `types` | Path to a `.d.ts` that declares `PluginState` (and any `$` noun). Validate prints `types ./types/index.d.ts declares state: <plugin>.<key>` [run]. |
| `userConfig` | Options passed to `register(on, options)`, see below. |
| `dependencies` | Your mod runs before the mods it depends on. Their types are copied to `.claude-plugin/types/<dep>/`. |
| `mcpServers` | Servers that `$.mcp.connect(server)` may connect. |

**`userConfig`** [docs + d.ts]. Keys match `[A-Za-z_][A-Za-z0-9_]*`. Each entry is a strict object
`{ type: 'string'|'number'|'boolean'|'directory'|'file', title, description, required?, default?,
options?: string[] (string only), multiple?, sensitive?, min?, max? }`.
- `register(on, options)` receives `PluginOptions = Readonly<Record<string, string | number |
  boolean | readonly string[]>>`, defaults filled in, validated before load. A bad value fails the
  load (`hooks module did not load: options do not fit plugin.json userConfig: …`).
- Stored in `settings.json` `pluginConfigs[<id>].options` (sensitive ones in the OS keychain); a
  `--plugin-dir` plugin's id is `<name>` or `<name>@inline`. A changed option reloads the plugin.

**`hooks/hooks.json`.** `"modules"` is an array with **one** path, relative to `hooks.json`. Its
presence is what makes the plugin a mod. The same file may also carry settings hooks under
`"hooks"`. Without `modules`, validate passes with no `hooks:` line.

**`types/index.d.ts`** (no top-level import or export):
```ts
declare module 'claude-code' {
  interface PluginState {
    'clodable': { edits: number; paneOpen: StateFamily<boolean> }  // StateFamily = per requestId
  }
  // interface EngineInterface { myNoun: MyNoun }   // only if the mod adds a $ noun
}
```

## 2. Module basics

```ts
export type Register = (on: On, options: PluginOptions) => unknown   // return dropped, a promise awaited
type On = {
  <P extends Pattern>(pattern: P, hook: HookFor<P>): Registration<HookFor<P>>
  <P extends Pattern, const M extends MatcherFor<P>>(pattern: P, matcher: M, hook: MatchedHook<P, M>): Registration<…>
}
type Registration<F> = { readonly catch: (handler: CatchHandler<F>) => void }
type Pattern = EventName | '*' | `${Namespace}.*` | `!${EventName | Glob}`  // '*' skips telemetry.*
// A hook is ($: EngineInterface, e: Frozen<Args<E>>, next: Next<E>) => EventResult<E> | Promise<EventResult<E>>
// Streaming events (turn.step, and a hook on process.spawn) take an async function* instead.
```
- Export either `export function register(on, options) {…}` or
  `export const register: Register = (on, options) => {…}`.
- **Imports from `'claude-code'`** are type-only (empty at run time), except these runtime helpers:
  `atom`, `derive`, `memberOf`, `read`, `update` (section 7). The only bare import allowed is
  `claude-code`. Other imports must be relative files inside the plugin. No dynamic `import()`, no
  `require`.
- **JSX:** the classic runtime. The engine prepends the `@jsx h` pragma.
  - Globals:
    `h(tag: string | ((props: never) => RenderNode | null | undefined), props, ...children)` and
    `Fragment`. `<>…</>` is a **column Box**.
  - There are no intrinsic tags: destructure them first with
    `const { Box, Text, Button } = $.ui.resolve(e)`.
  - Never declare, import, or shadow `h`/`Fragment`, and add no `@jsx` pragma of your own.
  - `JSX.IntrinsicAttributes = { key?: string }`. `false`, `null` and `undefined` children are
    dropped; numbers are drawn as strings.
- **Environment:** no DOM, no Node, **no timers** (use `$.clock`) and **no `console`** (only Client
  modules get `console`). No `eval`, `new Function` or WebAssembly. Available: `URL`,
  `URLSearchParams`, `TextEncoder`/`TextDecoder`, `AbortController`/`AbortSignal` (`timeout`,
  `any`), `atob`/`btoa`, `structuredClone`, `crypto.subtle.digest`, `crypto.randomUUID`,
  `crypto.getRandomValues`, `performance.now`.
- **`next`:**
  ```ts
  next(e): Promise<Result>                 // hooks beneath, then core
  next.to(e, tier)                         // only prepend/append (managed) mods may skip tiers
  next.signal: AbortSignal                 // dispatch abandoned (user interrupt, budget out, ...)
  next.is(pattern, e): e is …              next.event: EventName
  next.origin: { plugin: string; tier: 'prepend'|'user'|'append'|'builtin'|'core' }
                                           // engine = { plugin: 'engine', tier: 'core' }; Client post = 'client'
  next.trace: readonly TraceEntry[]        next.budget: { ms: number; remainingMs: number }
  // in a .catch handler only:
  next.error: { kind: 'throw'|'timeout'|'re-entry'; cause?: 'lent'; message?: string; budget: number }
  next.called: boolean                     // the failed hook had called next()
  ```
- **What a hook can do:**
  - Observe: `return next(e)`.
  - Rewrite: `return next({ ...e, field })`. `e` is deeply frozen, so assigning to it throws.
  - Answer: return a result without calling `next`.
  - If it fails **before** calling `next`, it is skipped and the next handler runs. If it fails
    **after** `next` resolved, that result stands.
  - Fail-closed guard:
    `on('tool.call', {tool:'Bash'}, guard).catch(($, e, next) => next.called ? next(e) : { deny: '…' })`.
- **Matchers:**
  - A leaf compares with `===` or a RegExp (tested against the value as a string). An array means
    any-of. An object is a partial match at any depth.
  - `{ component: 'ToolUse', props: { tool: ['Edit','Write'] } }` works [run]. Validate prints it as
    `ui.render{component=ToolUse, props has {tool=Edit|Write}}`.
  - Register each event once per matcher. Registering the same event twice without a matcher fails
    the load.
- **Order:** in tiers `prepend` → `user` → `append` → `builtin` → `core`. Within your module, hooks
  run in the order `on` was called. A `$.tool.call`, `$.prompt.submit` or `$.command.run` you make
  runs through every hook except the calling one; your plugin's other hooks still see it.
- **Static-analysis rules.** Both validate and load enforce these, and validate stops at the first
  error [run]:
  - Spell each call in full as `$.noun.method(…)`. You may pass `$` to a top-level function in the
    same file, or to `read`/`update`. `const ui = $.ui` fails (exact output in section 10).
  - Event names must be string literals. `on('tool.calls', …)` gives `"tool.calls" is not an event`.
  - Don't redeclare `on` inside `register`. Keep nested scopes under 2,000 levels.
  - String literals are required in `$.env.get('NAME')`/`$.env.set('NAME', …)`, in state refs
    `{ plugin, key }` (hold atoms in a `const`), and in a `Client` `module` path.

## 3. Events Clodable needs

### `session.start`
- **`e`:** `{ cwd: string; surface: RenderSurface | null; isInteractive: boolean }`.
- **Returns:** `next(e)`, which resolves to `{ cwd }`. Your own value changes nothing.
- **When:** once per process for each loaded plugin, before the first prompt. The first one is
  awaited, so a `$.tool.register` made here is listed by turn one. It fires again on reload, enable,
  or worker respawn.
- **Not** after `/clear`, `/resume` or `/branch`. Use
  `on('classic.SessionStart', { source: ['clear','resume','fork'] }, …)` for those.
- **Under `claude -p`** [run]: `{"surface":null,"isInteractive":false}`, `$.session.surfaces()`
  returns `[]`, and command origin is `sdk`.
- **Desktop** spawns the CLI as `--output-format stream-json --verbose --input-format stream-json`
  (from its bundle) and attaches later as surface `desktop` through `ui_attach`/`session.attach`.
  Expect the same `surface: null` and `isInteractive: false` at start. **Don't gate setup on
  either field** [UNVERIFIED].

### `turn.start`
- **`e`:** `{ text: string; turnId: string }`.
- **Returns:** `{ turnId }`. Observe only.

### `turn.complete` (good point for auto-save)
- **`e`:**
  ```ts
  { answer: string; durationMs: number; isAborted: boolean; turnId: string; agentId?: string; usage?: TurnUsage }
  & ({ reason: 'answer' | 'aborted' | 'error' } | { reason: 'refusal'; refusal: { category: string | null; explanation: string | null } })
  ```
- `TurnUsage = { input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens, model: string }`.
- **Returns:** `{ text: string; usage?: TurnUsage }`. A different `text` is shown **beneath** the
  answer; the stored record is untouched.
- Subagent turns fire it too, with `agentId` set. Main loop only: `if (e.agentId !== undefined) return next(e)`.

### `tool.call`
- **`e`:** `ToolCallInput = { tool: string; tool_use_id: string; agentId?: string; requestMeta?: Record<string,string>; …the tool's arguments spread as fields }`.
  - `tool`, `tool_use_id` and `agentId` are reserved: a rewrite of them is refused or ignored.
  - Narrowing works: `if (e.tool === 'Bash') e.command`.
- **Bash fields:** `command: string`, `timeout?: number`, `description?: string`,
  `run_in_background?: boolean`, `dangerouslyDisableSandbox?: boolean`.
- **Other tools:** Edit `file_path, old_string, new_string, replace_all?`; Write
  `file_path, content`; Read `file_path, offset?, limit?, pages?, allow_large?`. This build's list
  (`claude-code-tools/index.d.ts`) has no `Glob`/`Grep`.
- **MCP tools:** `e.tool` is `mcp__<server>__<tool>` and the arguments are spread as loose fields,
  typed only via `claude-code-mcp/index.d.ts`. `requestMeta` may carry only the `anthropic/sources`
  key (a string of at most 256 KiB), which reaches the server's `_meta` on connector relays only.
  Your own registered tools are `mcp__<plugin>__<name>`.
- **Deny:** `return { deny: 'instruction for Claude' }` without calling `next`. The tool doesn't
  run, no permission prompt appears, and Claude reads the text.
  - Returned **after** `await next(e)`, the deny withholds the result and undoes nothing. Claude
    reads `<tool> ran, and a plugin withheld its result: <text>`.
- **Answer:** `return { result, context?: readonly string[] }` (no `next`).
  - For a built-in tool, `result` must fit the tool's output schema; Bash needs at least
    `{ stdout, stderr, interrupted }`.
  - `context` is text only the model reads.
- **From core** (`await next(e)`): `{ ref, result, text, isReadOnly? }`, or
  `{ ref, result, text, isError: true }`, or `{ deny }`. Results are typed after narrowing:
  - Bash: `{ stdout, stderr, interrupted, … }`.
  - Write: `{ type: 'create'|'update', filePath, content, structuredPatch, originalFile, gitDiff? }`.
  - Edit: `{ filePath, oldString, newString, originalFile, structuredPatch, userModified, replaceAll, gitDiff? }`.
- **Rewrite:** `next({ ...e, command })`. Retry by calling `next(e)` again.
- **Hold:** `await $.ui.ask(…)` before `next`. Time spent waiting inside a `$` call doesn't count
  toward the budget.
- **Order with settings hooks:**
  - Managed `PreToolUse` hooks run before every mod, and their deny is final.
  - Other settings `PreToolUse` hooks run beneath the last mod's `next`. Answering without `next`
    skips them.
- **Failure:** a guard that throws is skipped and **the tool runs**, so add `.catch` (validate lists
  `gating hook without .catch`).

### `tool.check` (allow / ask / deny)
- **`e`:** `{ tool: string; input: unknown; tool_use_id?: string; agentId?: string; ceiling?: 'allow'|'ask'|'deny' }`.
  Every field is pinned, and `input` is `unknown`, so cast it:
  `(e.input as { command: string }).command`.
- **Returns:** `{ decision: 'allow'|'ask'|'deny'; reason?: string; rule?: string; hook?: string; ceiling?: … }`.
  `await next(e)` gives the engine's verdict (rules, mode, PreToolUse).
- Fires after `tool.call` and the PreToolUse hooks. A deny returned after `next` still holds.
- On a tool that requires the person (AskUserQuestion, plan approval), `allow` does not dismiss
  the dialog.
- Fail closed with `.catch(() => ({ decision: 'deny' }))`.
- `$.tool.check({ tool, input })` asks the same chain and runs nothing.

### `prompt.submit`
- **`e`:**
  `{ text: string; attachments?: readonly { type: 'image'|'audio'|'document'; mediaType?; filename? }[]; context?: readonly string[]; turnId?: string; wait: boolean; origin: PromptOrigin }`.
- **`origin.kind`:** `composer | bridge | sdk | task-notification | scheduled-trigger | peer |
  peer-send-message | projects-relay | channel{server} | coordinator | observer |
  observer-activity | auto-continuation | unclassified | slack-ping | plugin{name, asUser?}`.
  Under `-p` the origin is `sdk`. Desktop prompts likely arrive as `sdk` too, **not**
  `composer` [UNVERIFIED].
- **Returns:**
  - `next({ ...e, text })`: the transcript shows the new text.
  - `next({ ...e, context: [...(e.context ?? []), extra] })`: hidden text for Claude.
  - `{ drop: 'reason shown to the user' }`: no `next`, reason at most 4,096 characters. A drop
    returned after `next` fails the hook.
- **Result shape:** `{ text, context?, origin? } | { drop }`. `next(e)` resolves once the turn
  started or was queued.

### `command.run`
- **`e`:** `{ command: string; args: string; origin: PromptOrigin; presentation: { isFullscreen: boolean; columns: number } }`.
  Under `-p`: `{"isFullscreen":false,"columns":80}` [run].
- **Returns:** `{ text?: string; context?: readonly string[]; exitCode?: number /* -p only */ }`.
  - `{}` prints nothing.
  - `text` is printed as `<plugin>: <text>` and Claude reads it.
- **Register** in `session.start` with
  `$.command.register({ name, description, argumentHint?, immediate?: true })`.
  - `immediate` lets the command run mid-turn (e.g. open a pane while Claude works); without it, a
    command typed during a turn waits for the turn to end.
  - A built-in name throws (`"/focus" refused: it is the built-in /focus`).
  - If nothing answers the command: `<plugin> registered /x but no command.run hook answered it`.

### `ui.render`
- **`e`:**
  `{ surface: 'terminal'|'desktop'|'mobile'|'vscode'; component: RenderComponent; requestId: string; viewport?: { columns: number; rows: number; isFullscreen?: boolean }; props: RenderPropsOf[C] }`.
- **Return one of:**
  - a tree (`RenderElement`), which replaces the site;
  - `next(e)` (core's drawing, `{ type: 'engine', ref }`, which you may place inside your own Box);
  - `next({ ...e, props: { ...e.props, x } })`, which restyles core's drawing.
- An invalid tree, or a throw while drawn, means the engine draws its own. In `--plugin-dir`
  sessions the transcript says `<plugin>: ui.render (Pane) refused: <reason>; the engine drew its own`.
- **Fires:** per input value (props, width), at load, on `$.ui.invalidate('ui.render')`, and on a
  write to any `$.state` value it read. It may **read** `$.state` but never write it.

### `ui.message` (a `Client` posted)
- **`e`:** `{ surface, component, requestId, element /* Client key */, module, data: unknown }`.
- Only the drawing plugin's hooks see it, and `next.origin.plugin === 'client'`. Treat `data` as
  untrusted input.
- **Returns:** `next(e)` (core answers `{}`), or `{ props?: unknown }`, which hands that instance new
  props with no redraw. At most one per instance per frame.

### `classic.*` (the settings-hook events)
- **`e`** is the settings hook's stdin JSON:
  `{ hook_event_name, session_id, transcript_path, cwd, prompt_id?, permission_mode?, agent_id?, agent_type?, effort?: { level }, …event fields }`.
- **Returns:** `{ block?: string; preventContinuation?: true; stopReason?: string }` plus per-event
  fields:
  - SessionStart: `additionalContext`, `initialUserMessage`, `sessionTitle`, `watchPaths`, `reloadSkills`.
  - UserPromptSubmit: `additionalContext`, `sessionTitle`, `suppressOriginalPrompt`.
  - PostToolUse: `additionalContext`, `updatedToolOutput`, `updatedMCPToolOutput`.
  - Stop and SubagentStop: `additionalContext`.
  - PermissionRequest: `decision`.
  - PermissionDenied: `retry`.
  - MessageDisplay: `displayContent`.
  - WorktreeCreate: `worktreePath`.
- **`classic.PreToolUse`:** `e` is the `tool.call` envelope. The result is
  `{ allow: true } | { ask: string } | { deny: string } | {}`, plus `updatedInput?` and
  `additionalContext?`.
- **Useful inputs:**
  - `SessionStart.source: 'startup'|'resume'|'clear'|'compact'|'fork'`.
  - `Stop`: `{ stop_hook_active, last_assistant_message?, background_tasks?, session_crons? }`.
  - `PostToolUse`: `{ tool_name, tool_input, tool_response, tool_use_id, duration_ms? }`.
  - `SessionEnd.reason`.
- **All event names:** PreToolUse PostToolUse PostToolUseFailure PostToolBatch PermissionDenied
  Notification UserPromptSubmit UserPromptExpansion SessionStart SessionEnd Stop StopFailure
  SubagentStart SubagentStop PreCompact PostCompact PreModelSwitch PostModelSwitch
  PermissionRequest Setup TeammateIdle TaskCreated TaskCompleted Elicitation ElicitationResult
  ConfigChange InstructionsLoaded WorktreeCreate WorktreeRemove CwdChanged FileChanged
  DirectoryAdded MessageDisplay.

### Other events, briefly
`turn.step` (async generator: `const r = yield* next(e); return r`; result has `usage`,
`serverToolUses`) · `session.end` (one 1.5 s budget for the chain) · `session.attach`/`detach`
(`{ surface, clientId }`) · `session.measure` · `session.compact` (`{ skip }`) ·
`ui.press`/`ui.input`/`ui.select` (`{ plugin, element, component, requestId, surface, … }`) ·
`ui.close` (`{ id, origin: { kind: 'plugin'|'person'|'unload' } }`) · `ui.fault`
(`{ phase: 'load'|'render'|'run', reason }`) · `prompt.fill`/`suggest`/`edit` (terminal composer,
50 ms)/`autocomplete`/`section`/`context`/`compose`/`attachment`/`mention` · `tool.describe` ·
`command.describe` · `config.set`/`describe` · `agent.offer`/`spawn` · `plugin.register` ·
`engine.create` · `telemetry.*` (needs `{ to: 'collector' }`). **Every `$` call is itself an
event** (`fs.read`, `process.run`, `ui.open`, …): earlier mods can return `next(e)`, `{ deny }` or
`{ value }`, which is how tests stub them.

## 4. Render sites (`e.component`), with exact `e.props`

| Site | `requestId` | Raised on | `e.props` |
| :- | :- | :- | :- |
| `Pane` | pane `id` | every surface (in practice terminal + desktop) | `{ title: string; isFocused: boolean; bodyColumns: number; placement: 'dock'\|'inline'; scroll: { offset: number; bodyRows: number }; view: { agentId?: string } }` |
| `AbovePrompt` | one instance | terminal, desktop | `{ hasSurvey: boolean; isWorking: boolean; maxRows: number; bodyColumns: number; scroll: SiteScroll; view: SiteView }` |
| `ToolUse` | tool_use_id | every | `{ tool_use_id: string; tool: string; input: unknown; isRunning: boolean; isErrored: boolean; isInterrupted: boolean; output?: unknown; onScreen?: OnScreen \| null }` |
| `ToolResult` | tool_use_id | every | `{ tool_use_id: string; tool: string; output: unknown; isErrored: boolean; onScreen?: OnScreen \| null }` |
| `ToolGroup` | tool call id [docs] | every | `{ calls: ReadonlyArray<{ tool_use_id?: string; tool: string; input: unknown; isRunning: boolean; isErrored: boolean; isInterrupted: boolean; output?: unknown }>; isActive: boolean; isExpanded: boolean; onScreen?: … }` |
| `AskUserQuestion` | tool_use_id | every | `{ tool: string; questions: unknown[]; metadataSource?: string }` |
| `Spinner` | agent id | terminal, desktop | `{ word: string; message: string \| null; suffix: string; mode: 'requesting'\|'responding'\|'thinking'\|'tool-input'\|'tool-use' }` |
| `PromptHint` | one instance | terminal, desktop | `{ isDraft: boolean; isWorking: boolean; hint: string; tail?: string }` |
| `SessionMode` | one instance | terminal, desktop | `{ modes: readonly string[] }` |
| `UserMessage` | message id | every | `{ text: string; origin: PromptOrigin; isExpanded: boolean; task?: { id?, status?, type?, toolUseId?, durationMs? }; from?: { name: string, … }; onScreen?: … }` |
| `AssistantMessage` | message id | every | `{ text: string; isFirstOfReply: boolean; isSummary?: true; onScreen?: … }` |
| `CommandOutput` | message id | every | `{ command: string; args: string; text: string; isErrored: boolean; onScreen?: … }` |
| `ToolProgress` / `TurnDuration` / `InfoNotice` | | **terminal only** | `{ tool_use_id, kind: 'background_hint', hint }` / `{ word, durationMs, onScreen? }` / `{ text, command: string \| null, onScreen? }` |

`SiteScroll = { offset: number; bodyRows: number }`, `SiteView = { agentId?: string }`, and
`OnScreen = { first: number; last: number; of: number }` (`null` while off screen). Treat `view`
and `onScreen` as read-only: a rewrite must pass them on unchanged. The docs and the overview say
the VS Code chat panel and `-p` draw nothing.

Notes per site:
- **Pane:**
  - Size the tree to `bodyColumns`.
  - With `placement: 'dock'`, the pane has `scroll.bodyRows` rows. An `inline` pane grows with the
    tree up to `bodyRows`. A taller tree scrolls as a whole.
  - `$.ui.open({ rows, columns })` asks for a size.
- **AbovePrompt:**
  - Yield while `hasSurvey` is true. The band is shared: your tree replaces what later mods draw,
    so keep theirs with `<Box>{mine}{await next(e)}</Box>`.
  - The engine adds `[-]` and an `n more` row, and `bodyColumns` already excludes those 5 columns.
  - A bare digit typed into an empty prompt presses a band Button with that `hotkey`.
- **ToolUse:**
  - Rewriting props changes the row only. `output` is `BuiltinToolResults[tool]` once the call
    resolves.
  - Rows inside an expanded `ToolGroup` are `ToolUse` rows too.
  - On Desktop, `ToolGroupCall.tool_use_id` is "absent on a desktop host that predates it".
- **AskUserQuestion:** your tree must contain the `next(e)` reference **exactly once**, with your
  elements above it.
- **Spinner on desktop:** `word` is what the step is doing (`Creating notes.md`) or `Working`.
  Desktop never reports `tool-input`.
- **PromptHint:** only the terminal draws `tail` ("no other surface draws it yet"), so on Desktop
  rewrite `hint` instead.
- The **permission dialog is not a render site**. Use `$.ui.notice(tool_use_id, text)` for one line
  under it.

## 5. Elements and their exact props

**Tables per surface** (`$.ui.resolve(e)` returns `Elements[e.surface]`; narrow with `e.surface === 'desktop'`):
- **terminal:** Box Text Button Input Select Link Code Markdown Client Raster Image.
- **desktop:** Box Text Button Input Select **Svg** Link Code Markdown Client.
- **vscode:** the desktop table without Client. **mobile:** Box Text Button Svg Link Code Markdown.
- **Client surface modules** (any surface): Box Text Button Input Select Link Code Markdown (no
  Svg, Client, Raster or Image).

An element missing from a surface's table resolves to `undefined`, and a tree that contains it is
refused.

**Colors:** `type Color = ThemeKey | (string & {})`, documented as "a theme key, which follows the
person's theme, or any other string, a raw color (a name such as "red", or hex)". The theme keys:
`text inverseText inactive subtle suggestion remember success error warning merged claude
permission planMode autoAccept promptBorder bashBorder ide diffAdded diffRemoved diffAddedDimmed
diffRemovedDimmed diffAddedWord diffRemovedWord`. Other keys the theme holds also resolve.
- **[run]** Validation accepts **any** string on both terminal and desktop: `'#22c55e'`,
  `'#000'`, `'rgb(1,2,3)'`, even `'notacolor'`.
- "What a surface draws for one it does not know is its own" [UNVERIFIED: how Desktop paints hex].
- Use theme keys where the color should follow the theme. Hex is accepted.

**Box:** `key?` (makes a hover scope), `hover?: BoxHoverProps`, `position?: 'relative'|'absolute'`,
`top/left/right/bottom?`, `flexDirection?: 'row'|'column'|'row-reverse'|'column-reverse'`,
`flexGrow?`, `flexShrink?`, `flexWrap?`, `alignItems?`, `alignSelf?`,
`justifyContent?: 'flex-start'|'center'|'flex-end'|'space-between'|'space-around'|'space-evenly'`,
`gap?`, `columnGap?`, `rowGap?`, `width/height/minWidth/minHeight?: number|string`,
`margin*?`, `padding*?` (`X`, `Y`, `Top`, …), `borderStyle?`, `borderColor?: Color`,
`borderDimColor?`, `backgroundColor?: Color`, `overflow?: 'visible'|'hidden'`,
`display?: 'flex'|'none'`.
- `borderStyle` names: `single double round bold singleDouble doubleSingle classic arrow dashed quote`.
  Any other name draws no border [docs].
- Desktop draws a Box as a flex div.

**Text:** `color?`, `backgroundColor?`, `dimColor?`, `bold?`, `italic?`, `underline?`,
`strikethrough?`, `inverse?`,
`wrap?: 'wrap'|'end'|'middle'|'truncate'|'truncate-start'|'truncate-middle'|'truncate-end'`,
`hover?`.
- **No `key`:** `<Text key="x">` is silently dropped [run]. Key a Box/Button, or find the text in
  tests.
- Desktop draws Text as a styled span.

**Button:** `key?` (defaults to the label), `label?` (or string/`Text` children),
`onPress: (e: UiPressArgument) => void` (**required**), `hotkey?` (one digit or one lowercase
letter), `action?` (an engine keybinding action such as `'app:cycleDiffBase'`; the chord presses
it, **terminal**), `plain?: true`, `dimColor?`, `variant?: 'primary'|'secondary'`,
`role?: 'dismiss'` (Desktop draws its native close control), `autoFocus?: true`,
`hover?: TextHoverProps`.
- Desktop draws a native button, with the hotkey as a small key beside the label. The terminal
  draws `[ label ]`; with `plain`, `1: label`.
- Two buttons on one hotkey: the later one wins.
- `UiPressArgument = { plugin, element /* key */, component, requestId, surface, link? }`.
- [run] `<Button key="publish" variant="primary" hotkey="p" onPress={f}>Publish</Button>` becomes
  `{ type: 'Button', props: { key: 'publish', label: 'Publish', variant: 'primary', hotkey: 'p' }, press: {…} }`.
- [run, 2.1.295] Each `Button` call takes a new press handle (`++pressCounter`), and the engine
  maps it to the number Desktop clicks by, forgetting the numbers a redraw dropped. A redraw that
  draws the same button again renumbers it, and a click Desktop sends with the old number is lost
  (`ui_press not handled` in `claude.ai-web.log`; the second click works). Returning the **same
  element object** keeps its number: Clodable's `heldButton` (register.tsx) caches each button by
  its look and points its press at the newest closure. A cached button that left the drawing and
  came back still answers.

**Link:** `{ href: string; label?: string }`, and children are its text. Desktop draws an anchor.
- The d.ts says a remote surface draws anything but an `https:` href as plain text.
- The docs say Desktop also accepts `http://localhost[:port]`, requires no `@` (write `%40`), and
  needs the spelling `new URL(href).href` gives: no uppercase host, no `:443` [docs; localhost
  UNVERIFIED on 2.1.295].
- `href` is at most 2,048 characters. A longer one keeps the whole tree from drawing.

**Markdown:** `{ text: string; key?: string; dimColor?: boolean; onLinkPress?: (link: { href: string }, e: UiPressArgument) => void; pressableLinks?: readonly string[] }`.
- A leaf with no children. `key` is required with `onLinkPress`.
- Links other than `https:`, `http:` and `file:` are drawn as text. At most 256 `pressableLinks`.

**Code:** `{ source: string; language?: string; path?: string; startLine?: number; format?: 'source'|'diff'; wrap?: 'wrap'|'truncate-end' }`.
- A leaf drawn with the engine's highlighter. `format: 'diff'` takes unified-diff hunks.
- `language`/`path` are at most 10,000 characters [docs].

**Input** (not on mobile): `{ key: string; label?: string; placeholder?: string; value?: string; submitLabel?: string /* default 'submit' */; autoFocus?: true; onInput?: (value: string, e: UiInputArgument) => void; onSubmit: (value: string, e: UiInputArgument) => void }`.
- `UiInputArgument` carries `kind: 'change'|'submit'` and `value`.
- Draw with `value: ''` to clear the field after a submit.

**Select** (not on mobile): `{ key: string; label?: string; options: readonly { value: string; label?: string }[] /* ≥1, unique */; value?: string; autoFocus?: true; onSelect: (value: string, e: UiSelectArgument) => void }`.

**Svg** (desktop, mobile, vscode): `{ source: string /* ≤131,072 chars */; alt: string /* required */; width?: number; height?: number /* CSS px */; isInteractive?: boolean }`.
- **[run]** Missing `alt`: the constructor throws, so the hook is skipped and the site falls back.
- **[run]** Source over the limit gives
  `ui.render (Pane) refused: Svg source longer than 131072 characters; the engine drew its own`.
- **[run]** `<script>` and `onload` pass validation as data. The surface scrubs them: the frame has
  no allow-scripts.
- Drawn as an image, or with `isInteractive` in a script-less sandboxed frame (hover, CSS
  `:hover`, SMIL, `<title>` tooltips). It is a leaf: put a Button around it for presses.
- In the terminal, draw something else.

**Client** (terminal and desktop; the one element whose code runs on the surface's drawing side):
- **Props:** `{ key: string; module: string /* string literal path, relative to the hooks module file */; props?: unknown /* JSON, ≤100,000 chars */; width?: number|string; height?: number|string; flexGrow?: number }`.
- **Module:** a default export (or its one PascalCase export) of type
  `ClientModule<P, S> = (props: P, surface: ClientSurface<S>) => RenderElement`.
- **`ClientSurface<S>`:** `elements` (the ClientElements table above), `state: S | undefined`,
  `setState(next)`, `columns`, `rows`, `every(ms, fn) => stop`, `onPointer(fn) => clear`,
  `onKey(fn) => clear`, `post(data: JsonValue)` (arrives as `ui.message`).
  - Pointer events: `{ type: 'down'|'move'|'up'|'enter'|'leave'; x; y; fine?; button?: 'left'|'middle'|'right'; shift?; alt?; ctrl? }`.
  - Keys: `{ key; ctrl?; shift?; meta? }`. Escape never arrives.
- **Environment:** the module gets **no `$`**. It has the same globals as a hooks module plus
  `console`, no timers (use `surface.every`), and at most 1 s per call. On Desktop it runs in the
  app ("the desktop carries it as data", via the `ui_client_module` protocol).
- **Bounds:** a tree of 20,000 nodes, 32 deep, 100,000 characters; posts of 20,000 values, 32 deep,
  100,000 characters, at most one per frame. Three self-triggered `setState` renders in a row
  unmount it.
- **Failure:** fires `ui.fault`, then the site redraws, so leave the Client out of that drawing.

**Raster, Image:** terminal only (Raster is at most 512×256 cells, Image at most 2 MiB).

## 6. The `$` API: exact signatures

```ts
$.plugin.name: string                      $.plugin.root: string   // absolute plugin dir (sync props)

// ui
$.ui.resolve<E extends ResolveInput>(e: E): Elements[E['surface']]
$.ui.invalidate(event: 'ui.render'|'prompt.section'|'prompt.context'|'prompt.attachment'|'tool.describe'|'command.describe'|'config.describe'): void
$.ui.open(pane: { id: string; title?: string; focus?: true; closeOnEscape?: true; holdToasts?: true; rows?: number; columns?: number })
  : Promise<{ isPlaced: true } | { isPlaced: false; reason: string }>
$.ui.close(pane: { id: string }): Promise<void>                       // rejects on a hook's { deny }
$.ui.panes(): Promise<readonly { id: string; title: string; isShown: boolean; isFocused: boolean; isPlaced: boolean }[]>
$.ui.focus(args: { requestId: string; key: string }): Promise<{ deny?: string }>
$.ui.scroll(args: { to: UiScrollTarget; in?: string; block?: 'start'|'center'|'end'|'nearest' }): Promise<{ deny?: string }>
$.ui.toast(text: string, options?: { timeoutMs?: number /* default 4000; 1..60000 [docs] */ }): void
$.ui.status(text: string | undefined): void                           // one pinned line per plugin; undefined clears
$.ui.log(text: string, options?: { to?: 'transcript' | 'debug' }): void   // dim transcript line, not sent to model
$.ui.notice(tool_use_id: string, text: string | undefined): void      // line under an open dialog
$.ui.ask(question: string, options?: readonly string[] | { options?: readonly string[]; header?: string /* ≤12 */; multiSelect?: true }): Promise<string>
  // 2-4 labels; resolves label | comma-joined labels | free text; REJECTS when dismissed / "Chat about this" / -p
$.ui.copy(args: { text: string; surface?: RenderSurface }): Promise<{ isCopied: true } | { isCopied: false; reason: 'no-surface'|'no-clipboard'|'refused' }>
$.ui.selection(): Promise<{ text: string; requestId?: string } | undefined>   // undefined: nothing / fullscreen off / -p / surface answers none
$.ui.notify(text: string, options?: { title?: string }): Promise<{ isSent: true; channel: 'iterm2'|'iterm2_with_bell'|'kitty'|'ghostty'|'terminal_bell' } | { isSent: false; reason: 'disabled'|'no-channel'|'no-surface'|'refused' }>
$.ui.blit(args: RasterBlitArgs | ImageBlitArgs): Promise<UiBlitResult>     // terminal only

// process (d.ts: "CLI only", i.e. the engine's host; Desktop's local Code tab runs that engine [UNVERIFIED there])
$.process.run(argv: readonly string[], init?: { cwd?: string; env?: Record<string, string>; stdin?: string; timeoutMs?: number })
  : Promise<{ exitCode: number; stdout: string; stderr: string; isStdoutTruncated: boolean; isStderrTruncated: boolean }>
  // no shell; resolves for ANY exit code; rejects if it can't start or is still running at timeout
  // (30 s default, 10 min max); 4 MiB per stream; signal-killed exitCode reads 1; git runs with repo hooks off
$.process.spawn(request: { argv: readonly string[]; cwd?: string; env?: Record<string, string>; input?: string })
  : HookStream<{ stream: 'stdout' | 'stderr'; text: string }, { code: number | null; signal: string | null }>
  // for await (const { stream, text } of $.process.spawn({ argv })) {...}; NO timeout option: leaving the loop,
  // .return(), next.signal or module unload kills the child; HookStream adds .result: Promise<R>

// fs (relative paths = session cwd; UTF-8; 4 MiB per read/write)
$.fs.read(path: string): Promise<string>
$.fs.read(path: string, options: { as: 'bytes' }): Promise<{ base64: string }>
$.fs.write(path: string, text: string): Promise<void>                 // creates dirs; NOT atomic
$.fs.list(path?: string): Promise<{ name: string; kind: 'file'|'dir'|'other'; size: number; mtimeMs: number; isLink: boolean }[]>  // not recursive
$.fs.exists(path: string): Promise<boolean>
$.fs.stat(path: string, options?: { resolve: boolean }): Promise<{ kind; size; mtimeMs; isLink; realPath? }>  // rejects ENOENT
$.fs.ancestors(request: { names: string[]; of?: string; below?: string }): Promise<readonly { dir; name; content }[]>

// store (persistent JSON per plugin, ~/.claude/plugins/store/, shared by every session; 4 MiB total)
$.store.get(key: string): Promise<unknown>         $.store.set(key: string, value: unknown): Promise<void>   // JSON round-trip
$.store.delete(key: string): Promise<void>         $.store.keys(): Promise<string[]>

// state (session-scoped, reactive, survives hot reload; reset by /clear /resume /branch)
$.state.get<P, K>(ref: { plugin: P; key: K; id?: string }): Promise<{ value: T | undefined; version: number }>
$.state.set<P, K>(ref, value: T, options?: { ifVersion?: number }): Promise<{ isSet: boolean; version: number }>
  // own plugin only; refused while a ui.render hook draws; never undefined

// clock (no setTimeout/setInterval in hooks modules)
$.clock.now(): Promise<number>
$.clock.sleep(ms: number, options?: { signal?: AbortSignal }): Promise<void>   // counts against the hook budget
$.clock.after(ms: number, fn: () => void): { cancel(): void }
$.clock.every(ms: number, fn: () => void): { cancel(): void }                  // timers die on module reload

// http (through the host)
$.http.fetch(url: string, init?: { method?: string; headers?: Record<string, string>; body?: string; auth?: string; socketPath?: string })
  : Promise<{ status: number; ok: boolean; headers: Record<string, string>; text: string }>   // http(s) only; body read fully

// prompt
$.prompt.submit(input: { text: string; attachments?: readonly PromptSubmitAttachment[]; asUser?: true }): Promise<PromptSubmitResult>
  // waits until idle, resolves when ITS turn starts → `void $.prompt.submit(...)` inside busy hooks;
  // Claude reads "The <plugin> plugin sent a message: ..." unless asUser
$.prompt.fill(input: { text: string; mode?: 'replace'|'append'|'insert'; decorations?: PromptDecoration[] })
  : Promise<{ isFilled: boolean; refusal?: 'no_composer'|'dialog'; text: string; cursor: number }>
$.prompt.suggest(input: { text: string }): Promise<{ isShown: boolean }>      // dim, Tab to take; false while box has text / turn runs
$.prompt.read(): Promise<{ text: string; cursor: number }>                   // never rejects; '' where no box
$.prompt.compose(input?: Partial<PromptComposeInput>): Promise<{ sections }>

// session
$.session.cwd(): Promise<string>          $.session.root(): Promise<string>   // project root (/cd moves it; shell cd doesn't)
$.session.id(): Promise<string>           $.session.model(): Promise<string>  $.session.turns(): Promise<number>
$.session.repo(): Promise<{ root: string; remote: string | null; internal: boolean; name: string | null } | null>
$.session.surfaces(): Promise<readonly ('terminal'|'desktop'|'mobile'|'vscode')[]>   // [] in -p [run]
$.session.usage(args?: { breakdown?: 'summary'|'full'; columns?: number })
  : Promise<{ startedAt: number; context: { tokens?: number; window: number; percent?: number; breakdown? };
              rateLimits: { kind: string; percentUsed: number; resetsAt?: string }[]; cost?: { usd: number } }>
$.session.messages(): Promise<{ role: 'user'|'assistant'; text: string; toolUses: ToolUseSummary[]; toolResults? }[]>  // newest 4096
$.session.messages({ as: 'api' }): Promise<ApiMessage[]>     $.session.messages({ agentId }): Promise<SessionMessage[] | { deny }>
$.session.version(): Promise<{ version: string; base?: string; builtAt?: string }>
$.session.compact(input?: { instructions?: string }): Promise<SessionCompactResult>   // { skip } if vetoed; rejects mid-turn
$.session.send(input: { to: string | { sessionId: string } | { agentId: string }; text: string }): Promise<{ isDelivered: true } | { isDelivered: false; reason: string }>
$.session.append(args): Promise<…>        $.session.authorize(): Promise<{ handle; kind } | null>
$.turn.abort(input: { turnId: string }): Promise<void>

// model (session credentials; bills the user)
$.model.complete(request: { model: string /* 'haiku' or id */; prompt: string | readonly { text: string; cache?: true }[];
                            system?: string | readonly ModelTextBlock[]; maxTokens?: number /* 1024 default, ≤64000 */;
                            effort?: 'low'|'medium'|'high'|'xhigh'|'max'; timeoutMs?: number },
                 options?: { signal?: AbortSignal })
  : Promise<{ isAnswered: true; text: string; usage: ModelUsage }
          | { isAnswered: false; reason: 'api-error'; status: number | null; error: ModelApiError; usage }
          | { isAnswered: false; reason: 'empty-reply' | 'aborted'; usage }>       // API failure does NOT reject
$.model.fork(request: { prompt: string }): Promise<ModelCompleteResult | { isAnswered: false; reason: 'nothing-to-fork' }>
$.model.classify(text: string, labels: readonly string[] /* ≥2 */, options?: { model?: string }): Promise<string | undefined>  // rejects on failure

// mcp
$.mcp.call(server: string /* as /mcp lists it */, tool: string, args?: Record<string, unknown>)
  : Promise<{ content: McpContentBlock[]; isError: boolean; structuredContent?: unknown }>   // no permission prompt
$.mcp.connect(server: string /* key in this plugin's manifest */)
  : Promise<{ isConnected: true; server: string /* e.g. 'plugin:<plugin>:<server>' */ }
          | { isConnected: false; reason: 'unlisted'|'unapproved'|'disabled'|'policy'|'auth'|'failed'; message: string }>

// command / tool
$.command.register(command: { name: string; description: string; argumentHint?: string; immediate?: true }): Promise<{ command: string }>
$.command.run(input: { command: string; args?: string }): Promise<{ text?: string; context?: readonly string[] }>  // queued until idle
$.command.list(): Promise<{ name; description; source: 'builtin'|'plugin'|'user'|'mcp'; plugin? }[]>
$.tool.register(tool: { name: string; description: string; inputSchema?: Record<string, unknown>; isDeferred?: boolean }): Promise<{ tool: string }>
  // => mcp__<plugin>__<name>; serve it with on('tool.call', { tool: 'mcp__<plugin>__<name>' }, ...); rejects before session.start
$.tool.call(input: { tool: string; …args; consent?: string }): Promise<ToolCallResult>   // permission check + dialog, then the tool
$.tool.check(input: { tool: string; input: unknown }): Promise<ToolCheckResult>        // runs nothing
$.tool.list(): Promise<{ name: string; description: string; mcp: boolean }[]>

// env / settings (env names must be string literals)
$.env.get(name: 'LITERAL'): Promise<string | undefined>    $.env.set(name: 'LITERAL', value: string | undefined): Promise<void>
$.settings.read(args?: { source?: 'user'|'project'|'local'|'flag'|'policy' }): Promise<Readonly<Record<string, unknown>>>
// also: $.agent.{spawn,list,register}, $.config.{list,set}, $.audio.{play,speak}, $.telemetry (built-ins only)
```

Notes:
- **`$.ui.open`:**
  - `id` is 1 to 64 of `[A-Za-z0-9_-]`. Opening an open id only retitles it.
  - `focus`, `closeOnEscape` and `holdToasts` accept **only `true`**. `false` throws
    `ui.open: focus is true or left out`, the hook is skipped, and a `/cmd` can then report
    `no command.run hook answered it`.
  - `focus` is a request: it's granted only while the prompt holds the keys over an **empty**
    composer. Typed text, a focused band or pane, a dialog, or a survey each refuse it, and the
    pane opens without the keyboard.
  - "Asked" opens are placed at any width. An "asked" open comes from the person's command, prompt
    or press (not from `focus`).
  - Unasked opens (timers, `turn.start`) wait for 144 terminal columns, or 110 once the person has
    opened that id. They return `isPlaced: false` with a `reason`. A `-p` run places everything.
- **`$.ui.toast`:** in the terminal, an older toast from the same mod can give way to a newer one,
  and fullscreen draws at most 3 at a time. Panes opened with `holdToasts` hold all toasts.

## 7. State helpers (`import { atom, read, update, derive, memberOf } from 'claude-code'`)

```ts
atom<P, K>(ref: { plugin: P; key: K }, initial: T): Atom<T>             // also atom(ref, initial, { shape: 'v2' })
read($, source: Atom<T> | Derived<T>): Promise<T>                       // read($, ref) → T | undefined
update($, target: Atom<T>, change: (value: T) => T): Promise<T>        // get + set with ifVersion, retried on a miss
derive(sources: readonly (Atom | StateAddress)[], compute: (...values) => T): Derived<T>
memberOf(family, e)                                                     // a family's member keyed by e.requestId
```
```tsx
const edits = atom({ plugin: 'clodable', key: 'edits' }, 0)    // top level, const, string literals
const n = await read($, edits)                                 // inside ui.render: subscribes; redraws on write
<Button key="reset" onPress={() => update($, edits, () => 0)}>Reset</Button>   // write from callbacks/other hooks
```
| Keep it in | Lasts until | Use for |
| :- | :- | :- |
| module variable | the next hot reload (every save while developing) | throwaway UI state such as the open tab |
| `$.state` | session end, `/clear`, `/resume` or `/branch` (reload-safe) | values a drawing depends on |
| `$.store` | your mod deletes it, or `cleanupPeriodDays` of no use | settings and history; shared by all sessions, not atomic |

After `/clear`, copy `$.store` back into `$.state` from `classic.SessionStart`
`{ source: ['clear','resume','fork'] }`. `session.start` doesn't fire then.

## 8. Testing kit (`'claude-code/testing'`)

- **Run:** `claude plugin test [dir]`. It runs every `*.test.ts` and `*.test.tsx` under `dir` (the
  current folder by default). Each file runs in a child of the binary, in an environment like the
  hooks' (no fs, network or process).
  - It exits 1 when a test fails. Each test gets 5 s unless it passes `timeoutMs`.
  - Run from a folder with no mod, it reports whether mods can load at all [run]:
    `claude plugin test: …/empty: no hooks module to load; there is no hooks/hooks.json naming one in "modules"`.
- **Output format** [run]:
  ```
  tests/sample.test.ts:
  (pass) edits feed the band, the pane publishes, Edit rows read friendly [27.66ms]
  (pass) /publish opens the pane; the link follows userConfig [9.21ms]

   2 pass
   0 fail
  Ran 2 tests across 1 file. [0.20s]
  ```
  On a failure it prints `(fail) <name> [ms]`, the `AssertionError` with `Expected:`/`Received:`,
  and a `the engine reported:` block listing each skipped hook and the reason.
- **API:**
  ```ts
  import { test, describe, expect, mock, tier } from 'claude-code/testing'
  test(name: string, body: ($: Engine, on: On) => unknown): void
  test(name: string, options: { plugins?: Plugin[]; timeoutMs?: number; options?: PluginOptions /* userConfig */ }, body): void
  describe(name: string, body: () => void): void          tier('prepend' | 'user' | 'append' | 'builtin'): void
  ```
- **`$` (the engine) fires events into your mod:** `$.tool.call({ tool: 'Bash', command: 'ls' })`,
  `$.command.run({…})`, `$.prompt.submit`, `$.session.start({ surface, isInteractive, cwd })`,
  `$.turn.complete({ turnId, answer, durationMs, isAborted: false, usage: null })`,
  `$.classic.SessionStart({ source: 'clear' })`, and `$.ui.press/input/select({ plugin, key, … })`.
  A test can't fire a mods API call such as `ui.close` directly.
- **`on` registers stubs beneath every plugin.** Name a mods API call without `$.`. A stub returns
  `{ value }` (what the call resolves to) or `{ deny }` (the call rejects). A stub for an engine
  event returns that event's own result:
  ```ts
  on('tool.call', () => ({ result: 'ok' }))                                   // bottom of the tool chain
  on('process.run', ($, e) => ({ value: { exitCode: 0, stdout: 'main\n', stderr: '' } }))  // e = { argv, init? } [run]
  on('store.get', ($, e) => ({ value: saved.get(e.key) }))   on('store.set', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))       on('command.register', () => ({ value: undefined }))
  on('model.complete', () => ({ value: { isAnswered: true, text: 'PASS', usage } }))
  on('tool.call', ($, e) => ({ result: { answers: { [e.questions[0].question]: 'Run it' } } }))   // answers $.ui.ask
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['drawn by Claude Code'] }))       // when your hook calls next(e)
  on('session.start', () => ({ cwd: '/work' }))
  ```
  The kit answers these itself: `$.state`, `$.ui.invalidate`, `$.session.append`.
- **Mocks:** `mock.clock(on, { now? })` returns `{ now(), advance(ms), set(ms), settle(), sleep(ms) }`;
  `mock.store(on, entries?)`; `mock.env(on, vars)`; `mock.session(on)` returns `{ appended() }`.
- **Drawing:** `$.ui.mount({ plugin, surface /* required */, component, props, requestId?, viewport? })`
  returns `Mounted`, with these methods:
  - `drawn()`, `find(q)`, `findAll(q)`. The query is `{ type?, key?, text?: string | RegExp, in? }`
    and a match is `{ type, key, props, text, children }`.
  - `press({ key, plugin?, link? })`.
  - `input({ key, text, kind?: 'change'|'submit' })` and `select({ key, value })` (not on mobile).
  - `key`, `pointer`, `post`, `advance`, `resize` (Client only).
  - `redraw(props?)`, `unmount()`.
  Each act resolves after handlers and invalidated redraws settle. Run one body over
  `['terminal', 'desktop']`.
- **Matchers:** `toBe toEqual toStrictEqual toMatchObject toContain toContainEqual toHaveLength
  toHaveProperty toBeUndefined toBeDefined toBeNull toBeTruthy toBeFalsy toBeNaN toBeGreaterThan(OrEqual)
  toBeLessThan(OrEqual) toMatch toStartWith toEndWith toBeInstanceOf toThrow`, plus `.not`,
  `.resolves`, `.rejects`, `expect.any/anything/stringContaining/stringMatching/objectContaining/arrayContaining`.
- **Rules and gotchas:**
  - Register every stub **before** the first call on `$`, which loads the mods.
  - `session.start` doesn't run by itself, and each test starts from a fresh module.
  - An awaited call that no stub answers (`no implementation for process.run`) **skips the hook**.
    A fire-and-forget call such as `$.ui.toast` is just "dropped" [run].
  - Always pass `args: ''` to `$.command.run`. Otherwise a skipped hook ends with
    `next() passed an argument with no { args } (a string)` [run].
  - **tsc:** the test `$` types `command.run` as the full `CommandRunInput`, so to type-check, pass
    `origin: { kind: 'composer' }` and `presentation: { isFullscreen: true, columns: 120 }` too. The
    docs' own `$.command.run({ command, args })` example fails tsc [run].

## 9. Limits and gotchas

| Limit | Value |
| :- | :- |
| Hook time budget, per dispatch (only your own code; time inside `next` or `$` calls is free, except `$.clock.sleep`) | 10,000 ms (`HookBudget.ms`). Past it the hook is "absent" (skipped). `prompt.edit` gets 50 ms [docs]. |
| `.catch` handler | 1,000 ms (`catchMs`). A hook may linger 5,000 ms after `next.signal` aborts (`lingerMs`). |
| `session.end` chain | one 1.5 s wall-clock bound in total |
| `$.ui.invalidate('ui.render')` redraws | at most 10 a second, or 30 in the terminal for the shown pane, the expanded band and the prompt hint. Faster calls fold into one redraw. |
| `$.store` | 4 MiB of JSON in total (a set past it rejects) |
| `$.fs.read`/`write` | 4 MiB per file |
| `$.process.run` | 30 s default timeout, 10 min max; 4 MiB per stream |
| `$.model.complete` `maxTokens` | 1024 default, up to 64,000 |
| Text in one tree | the first 100,000 characters are drawn |
| `Svg` source / `Link` href / Client props | 131,072 / 2,048 / 100,000 characters |
| `$.ui.log` / `toast` / `status` text | 2,000 characters drawn in the terminal, 10,000 on a remote surface |
| `$.session.messages()` | the newest 4,096 entries |
| `drop` / `config.set` deny reason | 4,096 characters (longer ones are cut) |
| Command, tool, agent type and pane names | `[A-Za-z0-9_-]`, at most 64 |
| Unasked pane placement | 144 columns (110 once the person opened that id) |
| `claude plugin test` | 5 s per test unless `timeoutMs` |

**Focus and keys:**
- A pane gets the keyboard through `focus: true` (from a command or press, with an empty prompt),
  Ctrl+X Tab, or a click.
- With the focus: Tab moves, Enter presses or submits, a `hotkey` presses, and Esc returns the
  focus (and also closes the pane with `closeOnEscape`). Ctrl+X X closes the pane.
- A mod can't bind Tab or the arrow keys. `autoFocus` accepts only `true`.

**Other gotchas:**
- Hooks share one worker thread. A hook that never awaits gets the mod unloaded
  (`it crashed the hooks worker`). Three crashes not traced to one mod unload every non-built-in
  mod; `/reload-plugins` brings them back [docs].
- A failing guard lets the action through unless it has `.catch`.
- A `ui.render` hook can't write `$.state`.
- Module variables reset on every hot reload, and so do timers.

**Desktop versus terminal:**
- **Hooks:** Desktop runs the same engine (2.1.295), spawned with stream-json. So `session.*`,
  `turn.*`, `tool.*`, `prompt.submit`, `command.run` and `classic.*` fire there too.
  `session.start` likely carries `surface: null` and `isInteractive: false` [UNVERIFIED].
  `prompt.edit` and `prompt.autocomplete` belong to the terminal composer, so they probably don't
  fire on Desktop [UNVERIFIED].
- **Render sites:** Desktop raises `Pane`, `AbovePrompt`, `Spinner`, `PromptHint`, `SessionMode`
  and the transcript sites (`UserMessage`, `AssistantMessage`, `ToolUse`, `ToolResult`,
  `ToolGroup`, `CommandOutput`, `AskUserQuestion`). It does not raise `ToolProgress`,
  `TurnDuration` or `InfoNotice`. On Desktop, `PromptHint.tail` isn't drawn and Button `action`
  chords don't apply.
- **Elements:** Desktop has `Svg`, `Input`, `Select` and `Client`, but no `Raster` or `Image`. A
  Client module can't draw Svg.
- **UI ops** (from the strings in the Desktop 2.31226.1 bundle; not exercised):
  - The bundle handles `ui_render`, `ui_input`, `ui_select`, `ui_scroll`, `ui_focus`, `ui_close`,
    `ui_toast`, `ui_status`, `ui_log`, `ui_panes`, `ui_copy` and `ui_prompt_fill`.
  - Its `ui_attach` offers to answer `ui_copy`, `ui_prompt_read`, `ui_prompt_fill` and
    `ui_prompt_suggest`.
  - It has **no** `ui_notify`, `ui_blit` or `ui_selection`. `$.ui.notify` returns `no-surface` on
    Desktop (stated in the d.ts), and `$.ui.selection()` will most likely return `undefined`.
  - `$.ui.copy` still notes "a remote surface has no path yet". Check `isCopied`.
  - `$.mcp.connect` may return `unlisted` "where the session's host runs the plugin's servers
    itself".

## 10. Toolchain run log (2.1.296, macOS)

1. **Validate the sample** with `claude plugin validate docs/research/sample-mod`; exit 0 [run]:
   ```
   Validating plugin manifest: …/sample-mod/.claude-plugin/plugin.json

     ❯ types ./types/index.d.ts declares on $: nothing (no EngineInterface member)
     ❯ types ./types/index.d.ts declares state: clodable-sample.edits

   Validating hooks: …/sample-mod/hooks/hooks.json

     ❯ ./register.tsx hooks: session.start, command.run{command=publish}, tool.call{tool=Edit|Write}, ui.render{component=Pane}, ui.render{component=AbovePrompt}, ui.render{component=ToolUse, props has {tool=Edit|Write}}
     ❯ ./register.tsx answers its own command: command.run{command=publish}
     ❯ ./register.tsx gating hook without .catch: tool.call{tool=Edit|Write}
     ❯ ./register.tsx calls: $.command.register, $.state.get, $.state.set, $.ui.close, $.ui.open, $.ui.resolve
     ❯ ./register.tsx state writes: clodable-sample.edits
     ❯ ./register.tsx state reads: clodable-sample.edits

   ✔ Validation passed
   ```
   - `read`/`update` show up as `$.state.get`/`$.state.set`.
   - `--strict` passes too.
   - `--json` returns `{ success, strict, target, manifest: { errors, warnings, notes, gatingHooks }, contents: [{ file, type: 'hooks', errors, warnings, notes, gatingHooks: [{ module, pattern, hook, hasCatch }] }], advice }`.
2. **Validate error format** [run]. Validate stops at the first error and exits 1:
   ```
   ✘ Found 1 error:

     ❯ modules../register.tsx: <dir-name>: <abs>/hooks/register.tsx, compiled line 2 `on("tool.calls", …)`: "tool.calls" is not an event; $ is always spelled $.noun.event(...) at the call site, on is always on("<event>", hook), and next.to always next.to(e, "<tier>")

   ✘ Validation failed
   ```
   `const ui = $.ui` gives `` `const ui = $.ui;`: $.ui is used as a value (a noun of $ bound, passed or read); … ``.
3. **Test:** `claude plugin test docs/research/sample-mod` gave 2 pass and 0 fail (format in
   section 8). Errors I hit and fixed:
   - `find({ key: 'band-text' })` returned `undefined`, because Text drops `key`. I removed the
     keys from Text and query with `find({ type: 'Text', text: /not published/ })`.
   - `tsc` reported `TS2739 … missing … origin, presentation` on `$.command.run({ command, args })`
     in the test. I now pass `origin` and `presentation`.
4. **Type-check:** `tsc -p` on the sample passes with the engine-written tsconfig [run].
5. **Probes** [run]:
   - Every color string validates.
   - Svg: a missing `alt` skips the hook, an oversized source is refused, scripts pass validation
     as data.
   - `CLAUDE_CODE_PLUGIN_DIRS=<abs> claude -p "/ping"` and
     `claude --settings '{"env":{"CLAUDE_CODE_PLUGIN_DIRS":"<abs>"}}' -p "/ping"` both loaded the
     mod (`probe-mod: pong {"surface":null,"isInteractive":false} surfaces=[] origin=sdk …`). A
     command answered by a hook spends no model turn. Add `< /dev/null` to skip the 3 s stdin
     warning.

## 11. Loading a local plugin into Desktop's Code tab (development)

The Desktop app can't take `--plugin-dir`. Its bundle spawns the CLI with `--plugin-dir` itself for
installed and host-delivered plugins, and leaves `~/.claude` plugins to the CLI's own loader. Use
the documented variable:

1. **Point Desktop at the working copy.** Add this to **`~/.claude/settings.json`** (user settings;
   project and local settings can't set this variable):
   ```json
   { "env": {
       "CLAUDE_CODE_PLUGIN_DIRS": "/path/to/clodable/plugin",
       "CLAUDE_CODE_PLUGIN_DIR_WATCH": "1"
   } }
   ```
   - Use absolute paths (or ones starting with `~`); relative paths are skipped. Separate several
     paths with `:`.
   - Needs v2.1.280 or later. The plugin loads as `<name>@inline`, as `--plugin-dir` does.
   - `CLAUDE_CODE_PLUGIN_DIR_WATCH=1` turns on reload-on-save in **non-interactive** sessions. It's
     on by default only in interactive ones, and Desktop runs the CLI in stream-json mode, so set it
     [docs; Desktop behavior UNVERIFIED].
   - These settings also load the plugin in every terminal `claude` session.
   - A managed `disableSideloadFlags` setting blocks both the variable and `--plugin-dir`.
2. **Start a new Code tab session** (local, not WSL or cloud). Running sessions keep their plugin
   set; `/reload-plugins` reloads it.
3. **Check:** `/status` shows the Code tab's Claude Code version (2.1.286 or later; here 2.1.295).
   Run one of your commands (`/publish`) to confirm the mod loaded. Whether `@inline` plugins
   appear under the `+` button's **Plugins** menu is [UNVERIFIED].
4. **Debug:**
   - Add `"DEBUG": "1"` to the same `env`. Logs go to `~/.claude/debug/<session-id>.txt` (or
     `CLAUDE_CODE_DEBUG_LOGS_DIR`).
   - Grep for `hooks module <name>@inline loaded (…); events: …`, `not loaded:`,
     `hook skipped:` and `refused:`.
   - Use `$.ui.log(text, { to: 'debug' })` for your own lines.
5. **Iterate in the terminal first:** `claude --plugin-dir ./plugin` hot-reloads, prints refusals
   in the transcript, and regenerates `.claude-plugin/types/`. Run `claude plugin validate ./plugin`
   and `claude plugin test ./plugin` before trying Desktop.

Alternatives:
- **Skills directory:** `~/.claude/skills/<name>/.claude-plugin/plugin.json` auto-loads in every
  session as `<name>@skills-dir`. The Desktop bundle recognizes it as "plugins auto-loaded from
  `.claude/skills/`" [hot reload UNVERIFIED].
- **Local marketplace:** `claude plugin marketplace add <dir>`, then
  `claude plugin install <name>@<mkt>`, or Desktop's **Add plugin** browser. Installed copies are
  cached per `version`, so each edit needs a version bump and an update. This suits testing the
  install flow, not the edit loop.
- **Plugins aren't available** in WSL or cloud sessions.

## 12. Reference sample: `docs/research/sample-mod/`

Passes `validate` (also `--strict`), `plugin test` (2 tests) and `tsc` [run].
- `plugin.json`: `clodable-sample`, `types`, `userConfig.previewUrl`. `types/index.d.ts` declares
  `PluginState['clodable-sample'].edits: number`.
- `hooks/register.tsx` (TSX): `/publish` (`immediate`) opens the **Pane** (Svg dot on desktop
  only, edit count, `Link` to `options.previewUrl`, primary **Publish** button resetting the
  `edits` atom, `role="dismiss"` Close). The **AbovePrompt** band yields to surveys and shows a
  colored dot, `N change(s) not published` and a plain hotkey-`1` **Publish…** button. The
  **ToolUse** restyle (matcher `{ component: 'ToolUse', props: { tool: ['Edit','Write'] } }`) draws
  `✓ Updated App.tsx` / `✓ Created x.ts`. A `tool.call` observer counts successful edits into
  `$.state`.
- `tests/sample.test.ts`: band on terminal and desktop, Publish press, Edit row text, `/publish`
  opening `{ id, title, focus: true, closeOnEscape: true }`, Link following `userConfig` via
  `test(name, { options }, body)`, no Svg on the terminal.
- Not copied: the engine-generated `.claude-plugin/types/` and `tsconfig.json`; the first
  interactive `claude --plugin-dir docs/research/sample-mod` recreates them.
