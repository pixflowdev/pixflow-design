// Pixflow-owned: shared export point for chat composer controls used by the
// workspace chat today and by the Bricks Agent panel in later stages. Keeping
// this adapter thin avoids forking ChatComposer behavior.
export {
  ChatComposer as SharedChatComposer,
  type ChatComposerHandle as SharedChatComposerHandle,
  type ChatSendOutcome as SharedChatSendOutcome,
  type ChatSendMeta as SharedChatSendMeta,
} from '../ChatComposer';

export { SessionModeToggle as SharedChatModeToggle } from '../SessionModeToggle';
export { InlineModelSwitcher as SharedChatModelSwitcher } from '../InlineModelSwitcher';
