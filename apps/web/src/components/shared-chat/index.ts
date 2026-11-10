// Pixflow-owned: public import surface for shared chat UI primitives. Keep
// Bricks Agent imports pointed here instead of reaching into workspace-only
// components directly.
export * from './SharedChatComposer';
export * from './SharedComposerDock';
export * from './SharedChatRows';
export * from './SharedMessageStream';
export { useFloatingChatScroll } from './use-floating-chat-scroll';
export * from './SharedRunFailureCard';
