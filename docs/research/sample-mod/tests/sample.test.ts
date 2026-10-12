import { expect, test } from 'claude-code/testing'

// What Claude Code passes a ui.render hook for each site, minus `surface`.
const PANE = {
  plugin: 'clodable-sample',
  component: 'Pane',
  requestId: 'publish',
  viewport: { columns: 100, rows: 30 },
  props: {
    title: 'Publish',
    isFocused: true,
    bodyColumns: 60,
    placement: 'inline',
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

const BAND = {
  plugin: 'clodable-sample',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 6,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 6 },
    view: {},
  },
} as const

const EDIT_ROW = {
  plugin: 'clodable-sample',
  component: 'ToolUse',
  requestId: 'toolu_1',
  props: {
    tool_use_id: 'toolu_1',
    tool: 'Edit',
    input: { file_path: '/repo/src/App.tsx', old_string: 'a', new_string: 'b' },
    isRunning: false,
    isErrored: false,
    isInterrupted: false,
  },
} as const

test('edits feed the band, the pane publishes, Edit rows read friendly', async ($, on) => {
  // Bottom of the tool.call chain: answer in Claude Code's place, no tool runs.
  on('tool.call', () => ({ result: 'ok' }))

  await $.tool.call({ tool: 'Edit', file_path: 'src/App.tsx', old_string: 'a', new_string: 'b' })
  await $.tool.call({ tool: 'Write', file_path: 'src/new.ts', content: 'x' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const band = await $.ui.mount({ ...BAND, surface })
    expect((await band.find({ type: 'Text', text: /not published/ }))?.text).toBe('2 change(s) not published')
    await band.unmount()
  }

  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await pane.find({ type: 'Svg' })).toBeDefined()
  await pane.press({ key: 'publish' })
  expect((await pane.find({ type: 'Text', text: /unpublished/ }))?.text).toBe('0 unpublished edit(s) · last publish: just now')
  await pane.unmount()

  const row = await $.ui.mount({ ...EDIT_ROW, surface: 'desktop' })
  expect(await row.find({ type: 'Text', text: 'Updated App.tsx' })).toBeDefined()
})

test('/publish opens the pane; the link follows userConfig', { options: { previewUrl: 'https://preview.example.dev' } }, async ($, on) => {
  const opened: unknown[] = []
  on('ui.open', ($, e) => {
    opened.push(e)
    return { value: { isPlaced: true } }
  })

  // The test's $ is the engine: command.run takes the full input (origin, presentation) to type-check.
  const answer = await $.command.run({
    command: 'publish',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: true, columns: 120 },
  })
  expect(answer).toEqual({})
  expect(opened).toEqual([{ id: 'publish', title: 'Publish', focus: true, closeOnEscape: true }])

  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await pane.find({ type: 'Link' }))?.props.href).toBe('https://preview.example.dev')
  expect(await pane.find({ type: 'Svg' })).toBeUndefined()
})
