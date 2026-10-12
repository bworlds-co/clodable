// clodable-sample: one Pane, one AbovePrompt band, one ToolUse restyle (TSX).
// JSX compiles to the global `h`; tags come from $.ui.resolve(e), never globals.
import type { Register } from 'claude-code'
import { atom, read, update } from 'claude-code'

const PANE = 'publish'
// Reactive session value: a ui.render hook that reads it redraws when it changes.
const edits = atom({ plugin: 'clodable-sample', key: 'edits' }, 0)
// Module-level variable: lost on every hot reload.
// Note: Text takes no `key` prop (silently dropped); key Box/Button/Input/Select.
let lastPublish = 'never'

export const register: Register = (on, options) => {
  const previewUrl = String(options.previewUrl ?? 'https://example.com')

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'publish', description: 'Open the Publish pane', immediate: true })
    return next(e)
  })

  on('command.run', { command: 'publish' }, async ($) => {
    await $.ui.open({ id: PANE, title: 'Publish', focus: true, closeOnEscape: true })
    return {}
  })

  // Observe Edit/Write after they ran; count the successful ones.
  on('tool.call', { tool: ['Edit', 'Write'] }, async ($, e, next) => {
    const result = await next(e)
    if (!result.deny && !result.isError) await update($, edits, (n) => n + 1)
    return result
  })

  // 1. The Publish pane (opened by /publish or the band's button).
  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE) return next(e)
    const { Box, Text, Button, Link } = $.ui.resolve(e)
    const n = await read($, edits)
    const badge =
      e.surface === 'desktop'
        ? $.ui.resolve(e).Svg({
            alt: 'status dot',
            width: 12,
            height: 12,
            source: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12"><circle cx="6" cy="6" r="5" fill="#22c55e"/></svg>',
          })
        : null
    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row" columnGap={1}>
          {badge}
          <Text bold>Publish</Text>
        </Box>
        <Text dimColor>
          {n} unpublished edit(s) · last publish: {lastPublish}
        </Text>
        <Link href={previewUrl} label="Open preview" />
        <Box flexDirection="row" columnGap={2}>
          <Button
            key="publish"
            variant="primary"
            hotkey="p"
            onPress={async () => {
              lastPublish = 'just now'
              await update($, edits, () => 0)
            }}
          >
            Publish
          </Button>
          <Button key="close" role="dismiss" onPress={() => $.ui.close({ id: PANE })}>
            Close
          </Button>
        </Box>
      </Box>
    )
  })

  // 2. The band above the prompt (shared by every mod; yield to surveys).
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const n = await read($, edits)
    return (
      <Box flexDirection="row" columnGap={2}>
        <Text color={n === 0 ? '#22c55e' : 'warning'}>●</Text>
        <Text>{n === 0 ? 'All changes published' : `${n} change(s) not published`}</Text>
        <Button
          key="open-publish"
          hotkey="1"
          plain
          onPress={() => $.ui.open({ id: PANE, title: 'Publish', focus: true })}
        >
          Publish…
        </Button>
      </Box>
    )
  })

  // 3. Restyle Edit/Write rows into one friendly line; other tools untouched.
  on('ui.render', { component: 'ToolUse', props: { tool: ['Edit', 'Write'] } }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const { tool, input, isRunning, isErrored } = e.props
    const path = String((input as { file_path?: unknown }).file_path ?? '')
    const name = path.split('/').pop() || path
    const mark = isRunning ? '…' : isErrored ? '✗' : '✓'
    return (
      <Box flexDirection="row" columnGap={1}>
        <Text color={isErrored ? 'error' : 'success'}>{mark}</Text>
        <Text>
          {tool === 'Write' ? 'Created' : 'Updated'} {name}
        </Text>
      </Box>
    )
  })
}
