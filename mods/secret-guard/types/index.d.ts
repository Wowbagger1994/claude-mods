declare module 'claude-code' {
  interface PluginState {
    'secret-guard': {
      /** Secrets blotted out this session, by label (`token Google ya29.`): never a value. */
      counts: Record<string, number>
    }
  }
}

/** A label of a kind of secret, as shown in place of its value. */
export type SecretLabel = string
