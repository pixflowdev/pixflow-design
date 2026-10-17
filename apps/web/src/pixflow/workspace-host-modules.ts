/** Shared Free implementations used by the separately packaged Workspace. */
import * as SharedChat from '../components/shared-chat';
import * as ChatComposer from '../components/shared-chat/SharedChatComposer';
import * as ComposerDock from '../components/shared-chat/SharedComposerDock';
import * as ChatRows from '../components/shared-chat/SharedChatRows';
import * as MessageStream from '../components/shared-chat/SharedMessageStream';
import * as RunFailure from '../components/shared-chat/SharedRunFailureCard';
import * as Settings from '../components/SettingsDialog';
import * as Onboarding from '../components/OnboardingView';
import * as AvatarMenu from '../components/AvatarMenu';
import * as ModelSwitcher from '../components/InlineModelSwitcher';
import * as AgentIcon from '../components/AgentIcon';
import * as AssistantMessage from '../components/AssistantMessage';
import * as BridgeGate from './bridge-update-gate';
import * as Features from './feature-runtime';
import * as WordPress from './wordpress-context';
import * as Bridge from './optional-bridge';
import * as Fetch from './runtime-fetch';
import * as DirectSite from './direct-site';
import * as DirectByok from './direct-site-byok';
import * as Daemon from '../providers/daemon';
import * as Anthropic from '../providers/anthropic';
import * as English from '../i18n/locales/en';
import * as LexicalInput from '../components/composer/LexicalComposerInput';
import * as PlusMenu from '../components/ComposerPlusMenu';
import * as Icon from '../components/Icon';
import * as MaxTokens from '../state/maxTokens';

// These implementations are already needed by Free's settings or floating chat.
import * as ComposerQueue from '../components/ComposerQueue';
import * as QuestionForm from '../components/QuestionForm';
import * as QuestionRequest from '../components/QuestionRequestCard';
import * as QuestionArtifacts from '../artifacts/question-form';
import * as SkillLibrary from '../components/SkillLibraryPanel';
import * as SkillDetails from '../components/SkillLibraryDetails';
import * as SkillCatalogue from '../components/useSkillLibraryCatalogue';
import * as SkillCategories from '../components/skill-library-categories';
import * as SkillDisplay from '../i18n/skill-display';
import * as Preview from '../components/PreviewModal';
import * as PluginDetails from '../components/PluginDetailsModal';
import * as GeneratedMedia from '../components/chat/GeneratedMedia';
import * as SessionMode from '../components/SessionModeToggle';
import * as CustomSelect from '../components/CustomSelect';
import * as CaretLayer from '../components/composer/CaretFloatingLayer';
import * as Markdown from '../runtime/markdown';
import * as Srcdoc from '../runtime/srcdoc';
import * as ChatHistory from './chat-history-client';
import * as HistoryExport from './chat-history-export';
import * as HistoryControls from './ChatHistoryControls';
import * as ChatExport from './ChatExportButton';
import * as BridgeStatus from '../components/WorkspaceBridgeStatus';
import * as Planning from './planning-contribution';
import * as Portals from '../components/workspacePortalTarget';
import * as Loading from '../components/Loading';
import * as WorkspaceLoading from '../components/WorkspaceLoading';
import * as HistoryPersistence from '../state/workspace-history-persistence';
import * as Notifications from '../utils/notifications';
import * as License from './license';
import * as ResourceDraft from './resource-draft';
import * as ExternalMcp from './external-mcp-contribution';
import * as MediaModelCatalogue from '../media/aihubmix-image-models';
import { HtmlSurface } from '../components/plugins-home/cards/HtmlSurface';

export const workspaceHostModules: Record<string, unknown> = {
  'pixflow-host-shared-chat': SharedChat,
  'pixflow-host-chat-composer': ChatComposer,
  'pixflow-host-composer-dock': ComposerDock,
  'pixflow-host-chat-rows': ChatRows,
  'pixflow-host-message-stream': MessageStream,
  'pixflow-host-run-failure': RunFailure,
  'pixflow-host-settings': Settings,
  'pixflow-host-onboarding': Onboarding,
  'pixflow-host-avatar-menu': AvatarMenu,
  'pixflow-host-model-switcher': ModelSwitcher,
  'pixflow-host-agent-icon': AgentIcon,
  'pixflow-host-assistant-message': AssistantMessage,
  'pixflow-host-bridge-gate': BridgeGate,
  'pixflow-host-features': Features,
  'pixflow-host-wordpress': WordPress,
  'pixflow-host-bridge': Bridge,
  'pixflow-host-fetch': Fetch,
  'pixflow-host-direct-site': DirectSite,
  'pixflow-host-direct-byok': DirectByok,
  'pixflow-host-daemon': Daemon,
  'pixflow-host-anthropic': Anthropic,
  'pixflow-host-english': English,
  'pixflow-host-lexical-input': LexicalInput,
  'pixflow-host-plus-menu': PlusMenu,
  'pixflow-host-icon': Icon,
  'pixflow-host-max-tokens': MaxTokens,
  'pixflow-host-composer-queue': ComposerQueue,
  'pixflow-host-question-form': QuestionForm,
  'pixflow-host-question-request': QuestionRequest,
  'pixflow-host-question-artifacts': QuestionArtifacts,
  'pixflow-host-skill-library': SkillLibrary,
  'pixflow-host-skill-details': SkillDetails,
  'pixflow-host-skill-catalogue': SkillCatalogue,
  'pixflow-host-skill-categories': SkillCategories,
  'pixflow-host-skill-display': SkillDisplay,
  'pixflow-host-preview': Preview,
  'pixflow-host-plugin-details': PluginDetails,
  'pixflow-host-generated-media': GeneratedMedia,
  'pixflow-host-session-mode': SessionMode,
  'pixflow-host-custom-select': CustomSelect,
  'pixflow-host-caret-layer': CaretLayer,
  'pixflow-host-markdown': Markdown,
  'pixflow-host-srcdoc': Srcdoc,
  'pixflow-host-chat-history': ChatHistory,
  'pixflow-host-history-export': HistoryExport,
  'pixflow-host-history-controls': HistoryControls,
  'pixflow-host-chat-export': ChatExport,
  'pixflow-host-bridge-status': BridgeStatus,
  'pixflow-host-planning': Planning,
  'pixflow-host-portals': Portals,
  'pixflow-host-loading': Loading,
  'pixflow-host-workspace-loading': WorkspaceLoading,
  // Keep outbox recovery, license mutations and pending drafts single-owner.
  'pixflow-host-history-persistence': HistoryPersistence,
  'pixflow-host-notifications': Notifications,
  'pixflow-host-license': License,
  'pixflow-host-resource-draft': ResourceDraft,
  'pixflow-host-external-mcp': ExternalMcp,
  'pixflow-host-media-model-catalogue': MediaModelCatalogue,
  'pixflow-host-html-surface': { HtmlSurface },
};
