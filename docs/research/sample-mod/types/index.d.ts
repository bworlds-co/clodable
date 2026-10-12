// Declares the $.state values this mod owns (plugin.json "types" points here).
declare module 'claude-code' {
  interface PluginState {
    'clodable-sample': {
      edits: number
    }
  }
}
