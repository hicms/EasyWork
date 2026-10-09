/** Public draft handoff between independently owned composer features. */
export interface ComposerReference {
  source: string;
  ref: string;
  readonly label: string;
  readonly appearance?: 'session' | 'file' | 'folder';
  readonly clipboardText: string;
  readonly offset: number;
  readonly length: number;
}
export interface ComposerHandoffSource {
  readonly sessionId: string;
  readonly draft: string;
  readonly references: readonly ComposerReference[];
}
export interface ComposerHandoff {
  readonly sourceSessionId: string;
  readonly targetSessionId: string;
  readonly references: ComposerReference[];
}
