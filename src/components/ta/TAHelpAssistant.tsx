import { useEffect, useRef, useState } from 'react';
import { Bot, Loader2, MessageSquareText, Minimize2, RotateCcw, Send, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

import { Textarea } from '@/components/ta/ui/textarea';
import {
  FALLBACK_OPENROUTER_HELP_MODEL,
  getTaPortalRedirectResponse,
  isTaPortalHelpQuestion,
  isHelpAssistantConfigured,
  requestTaHelpAnswer,
  TA_CHAT_NAME,
  TA_CHAT_LAUNCHER_LABEL,
  type HelpAssistantMessage,
} from '@/lib/ta-help-assistant';
import {
  buildCurrentScreenAnswer,
  planHelpAssistantAction,
  type HelpContextSnapshot,
  type HelpAssistantAction,
  type ResolvedConversationIntent,
} from '@/lib/ta-help-actions';

interface TAHelpAssistantProps {
  snapshot?: HelpContextSnapshot | null;
  onRunAction?: (action: HelpAssistantAction) => void;
}

const TA_MODULE_NAMES = [
  'TA Dashboard',
  'Attendance Workspace',
  'Zoom Processor',
  'Live Attendance',
  'Roster Management',
  'Consolidated View',
  'Session Management',
  'Rule Exceptions',
  'Late Days',
  'Issue Queue',
  'Export Data',
  'Lists & Settings',
];
const MODULE_NAME_PATTERN = new RegExp(`\\b(${TA_MODULE_NAMES.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'g');

const createAssistantMessage = (content: string): HelpAssistantMessage => ({
  role: 'assistant',
  content,
});

const createUserMessage = (content: string): HelpAssistantMessage => ({
  role: 'user',
  content,
});

const getInitialMessages = (configured: boolean): HelpAssistantMessage[] => [
  createAssistantMessage(
    configured
      ? `I am ${TA_CHAT_NAME}. I follow the exact TA portal screen you are on, prepare safe actions for you, and stop before any final saved action.`
      : 'The help assistant UI is ready, but live answers need VITE_OPENROUTER_API_KEY. Once configured, ask for any TA workflow step by step.',
  ),
];

const renderModuleAwareText = (text: string) => {
  const parts = text.split(MODULE_NAME_PATTERN);

  return parts.map((part, index) => {
    if (TA_MODULE_NAMES.includes(part)) {
      return (
        <span key={`${part}-${index}`} className="font-bold status-all-table-text">
          {part}
        </span>
      );
    }

    return <span key={`${part}-${index}`}>{part}</span>;
  });
};

const renderInlineFormatting = (text: string) => {
  const segments = text.split(/(\*\*[^*]+\*\*)/g);

  return segments.map((segment, index) => {
    if (segment.startsWith('**') && segment.endsWith('**')) {
      return (
        <strong key={`${segment}-${index}`} className="font-extrabold status-white-soft-text">
          {renderModuleAwareText(segment.slice(2, -2))}
        </strong>
      );
    }

    return <span key={`${segment}-${index}`}>{renderModuleAwareText(segment)}</span>;
  });
};

const renderMessageContent = (content: string) => {
  const lines = content.split('\n').filter((line, index, all) => !(line.trim() === '' && all[index - 1]?.trim() === ''));

  return (
    <div className="space-y-2">
      {lines.map((line, index) => {
        const trimmed = line.trim();

        if (!trimmed) {
          return <div key={`spacer-${index}`} className="h-2" />;
        }

        const orderedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
        const bulletMatch = trimmed.match(/^[-*]\s+(.*)$/);

        if (orderedMatch) {
          return (
            <div key={`ordered-${index}`} className="flex gap-3">
              <span className="w-6 flex-none text-right font-black text-debossed-sm">{orderedMatch[1]}.</span>
              <div className="min-w-0 flex-1">{renderInlineFormatting(orderedMatch[2])}</div>
            </div>
          );
        }

        if (bulletMatch) {
          return (
            <div key={`bullet-${index}`} className="flex gap-3">
              <span className="w-6 flex-none text-center font-black text-debossed-sm">•</span>
              <div className="min-w-0 flex-1">{renderInlineFormatting(bulletMatch[1])}</div>
            </div>
          );
        }

        return (
          <p key={`line-${index}`} className="leading-6">
            {renderInlineFormatting(trimmed)}
          </p>
        );
      })}
    </div>
  );
};

export default function TAHelpAssistant({ snapshot, onRunAction }: TAHelpAssistantProps) {
  const moduleStage = snapshot?.moduleStage ?? null;
  const configured = isHelpAssistantConfigured();
  const [isOpen, setIsOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<HelpAssistantMessage[]>(() => getInitialMessages(configured));
  const [conversationIntentContext, setConversationIntentContext] = useState<ResolvedConversationIntent | null>(null);
  const [lastResponseUsedFallback, setLastResponseUsedFallback] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const setChatOpenState = (nextOpen: boolean) => {
    if (!nextOpen && textareaRef.current && document.activeElement === textareaRef.current) {
      textareaRef.current.blur();
    }
    setIsOpen(nextOpen);
  };

  const handleSlashShortcut = (origin: 'global' | 'input') => {
    if (origin === 'input' && draft.trim()) {
      return;
    }
    setChatOpenState(!isOpen);
  };

  useEffect(() => {
    if (!scrollRef.current) {
      return;
    }

    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isSending]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTypingTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        Boolean(target?.isContentEditable);
      const isAuxiliumInput = target === textareaRef.current;

      if (event.key === 'Escape' && isOpen) {
        event.preventDefault();
        setChatOpenState(false);
        return;
      }

      if (event.key !== '/') {
        return;
      }

      if (isAuxiliumInput) {
        event.preventDefault();
        handleSlashShortcut('input');
        return;
      }

      if (isTypingTarget) {
        return;
      }

      event.preventDefault();
      handleSlashShortcut('global');
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [draft, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const timer = window.setTimeout(() => {
      textareaRef.current?.focus();
    }, 220);

    return () => window.clearTimeout(timer);
  }, [isOpen]);

  const resetConversation = () => {
    setDraft('');
    setMessages(getInitialMessages(configured));
    setConversationIntentContext(null);
    setLastResponseUsedFallback(false);
  };

  const submitQuestion = async (rawQuestion: string) => {
    const question = rawQuestion.trim();
    if (!question || isSending) {
      return;
    }

    const nextUserMessage = createUserMessage(question);
    const nextHistory = [...messages, nextUserMessage];
    setMessages(nextHistory);
    setDraft('');

    const directPlan = planHelpAssistantAction(question, snapshot, conversationIntentContext);
    if (directPlan) {
      setLastResponseUsedFallback(false);
      if (directPlan.rememberedIntent) {
        setConversationIntentContext(directPlan.rememberedIntent);
      }
      if (directPlan.action) {
        onRunAction?.(directPlan.action);
      }
      setMessages((current) => [...current, createAssistantMessage(directPlan.response)]);
      return;
    }

    const currentScreenAnswer = buildCurrentScreenAnswer(question, snapshot);
    if (currentScreenAnswer) {
      setLastResponseUsedFallback(false);
      setMessages((current) => [...current, createAssistantMessage(currentScreenAnswer)]);
      return;
    }

    if (!isTaPortalHelpQuestion(question, snapshot)) {
      setLastResponseUsedFallback(false);
      setMessages((current) => [
        ...current,
        createAssistantMessage(
          getTaPortalRedirectResponse(),
        ),
      ]);
      return;
    }

    if (!configured) {
      setLastResponseUsedFallback(false);
      setMessages((current) => [
        ...current,
        createAssistantMessage(
          'Live answers are disabled until VITE_OPENROUTER_API_KEY is configured. Auxilium is designed to answer from the TA operations manual once the key is available.',
        ),
      ]);
      return;
    }

    setIsSending(true);
    try {
      const result = await requestTaHelpAnswer({
        question,
        snapshot,
        history: messages,
        rememberedIntent: conversationIntentContext,
      });
      setLastResponseUsedFallback(result.usedFallback);

      setMessages((current) => [...current, createAssistantMessage(result.answer)]);
    } catch (error: unknown) {
      setLastResponseUsedFallback(false);
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast.error('Help assistant request failed', { description: message });
      setMessages((current) => [
        ...current,
        createAssistantMessage(
          'I could not complete that request right now. Try again in a moment, or ask the same question with the module name and task in one sentence.',
        ),
      ]);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-40 max-sm:left-3 max-sm:right-3 max-sm:bottom-3">
      <div
        className={`aux-chat-shell neo-out relative overflow-hidden border border-[#141517] ${
          isOpen
            ? 'h-[688px] w-[396px] rounded-[30px] max-sm:h-[74vh] max-sm:w-full'
            : 'h-[56px] w-[236px] cursor-pointer rounded-full max-sm:ml-auto'
        }`}
      >
        <div className="matte-grain opacity-70" />

        <button
          type="button"
          onClick={() => setChatOpenState(true)}
          className={`aux-chat-launcher absolute inset-0 z-10 flex items-center justify-center gap-2.5 px-5 ${
            isOpen ? 'pointer-events-none opacity-0 scale-95' : 'pointer-events-auto opacity-100 scale-100'
          }`}
          aria-label={TA_CHAT_LAUNCHER_LABEL}
        >
          <span className="inline-flex items-center gap-2 text-debossed-sm">
            <Sparkles className="h-4 w-4 status-purple-table-text status-purple-breathe" />
            <span className="status-purple-table-text status-purple-breathe">{TA_CHAT_LAUNCHER_LABEL}</span>
            <span className="aux-chat-shortcut neo-in rounded-md border border-[#141517] px-1.5 py-0.5 text-[10px] font-black text-debossed-sm">
              /
            </span>
          </span>
        </button>

        <div
          className={`aux-chat-panel absolute inset-0 z-20 flex flex-col p-5 ${
            isOpen ? 'pointer-events-auto opacity-100 translate-y-0' : 'pointer-events-none opacity-0 translate-y-8'
          }`}
        >
          <div className="mb-4 flex items-start justify-between gap-3 shrink-0">
            <div className="flex min-w-0 items-start gap-4">
              <div className="neo-in flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#141517]">
                <Bot className="h-4 w-4 text-debossed-sm status-all-text" />
              </div>

              <div className="min-w-0">
                <h2 className="text-left text-[1.65rem] font-black tracking-tight text-debossed max-sm:text-2xl">
                  {TA_CHAT_NAME}
                </h2>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-3">
              <div
                className={`neo-in flex h-3 w-3 items-center justify-center rounded-full border border-[#141517] ${lastResponseUsedFallback ? 'status-absent-led' : ''}`}
                aria-label={lastResponseUsedFallback ? `Fallback model active: ${FALLBACK_OPENROUTER_HELP_MODEL}` : 'Primary model active'}
                title={lastResponseUsedFallback ? 'Fallback model active' : 'Primary model active'}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full transition-all duration-200 ${lastResponseUsedFallback ? 'bg-[var(--color-absent)] shadow-[0_0_8px_var(--color-absent)]' : 'bg-[#2a2d31]'}`}
                />
              </div>

              <button
                type="button"
                onClick={resetConversation}
                className="neo-in flex h-10 w-10 items-center justify-center rounded-full border border-[#141517] text-debossed-sm transition-all duration-200 hover:translate-y-[-1px]"
                aria-label="Clear chat"
              >
                <RotateCcw className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={() => setChatOpenState(false)}
                className="neo-in flex h-10 w-10 items-center justify-center rounded-full border border-[#141517] text-debossed-sm transition-all duration-200 hover:translate-y-[-1px]"
                aria-label="Minimize help assistant"
              >
                <Minimize2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          {moduleStage ? (
            <div className="mb-5 inline-flex max-w-full self-start rounded-full neo-in px-4 py-2 text-[11px] text-debossed-sm border border-[#141517]">
              <span className="truncate">{moduleStage}</span>
            </div>
          ) : null}

          <div ref={scrollRef} className="no-scrollbar min-h-0 flex-1 overflow-y-auto pb-3">
            <div className="flex flex-col gap-5">
              {messages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[90%] border px-5 py-4 ${
                      message.role === 'user'
                        ? 'neo-in rounded-[24px] rounded-tr-[16px] border-[#111214]'
                        : 'neo-out rounded-[24px] rounded-tl-[16px] border-[#141517]'
                    }`}
                  >
                    <div className={`mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-debossed-sm ${message.role === 'user' ? 'justify-end' : ''}`}>
                      {message.role === 'user' ? (
                        <>
                          <MessageSquareText className="h-3.5 w-3.5 status-present-text" />
                          You
                        </>
                      ) : (
                        <>
                          <Bot className="h-3.5 w-3.5 status-all-text" />
                          {TA_CHAT_NAME}
                        </>
                      )}
                    </div>
                    <div className="text-[15px] leading-7 text-debossed-body">{renderMessageContent(message.content)}</div>
                  </div>
                </div>
              ))}

              {isSending && (
                <div className="flex justify-start">
                  <div className="neo-out rounded-[24px] rounded-tl-[16px] border border-[#141517] px-5 py-4">
                    <div className="flex items-center gap-2 text-sm text-debossed-body">
                      <Loader2 className="h-4 w-4 animate-spin status-all-text" />
                      Building a step-by-step answer...
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="relative mt-4 shrink-0">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void submitQuestion(draft);
              }}
            >
              <div className="neo-in rounded-[22px] border border-[#111214] p-4 pb-[4.1rem]">
                <Textarea
                  ref={textareaRef}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === '/') {
                      event.preventDefault();
                      event.stopPropagation();
                      handleSlashShortcut('input');
                      return;
                    }

                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      void submitQuestion(draft);
                    }
                  }}
                  placeholder="Start typing or ask for help"
                  className="min-h-[76px] resize-none border-0 bg-transparent px-0 py-0 text-[15px] font-semibold text-debossed-body shadow-none placeholder:text-[#4a4f56] focus-visible:ring-0"
                />
              </div>

              <button
                type="submit"
                disabled={isSending || !draft.trim()}
                className="neo-btn neo-out absolute bottom-4 right-4 flex items-center gap-2 rounded-full border border-[#141517] px-5 py-3 text-sm font-black tracking-[0.14em] text-debossed transition-all duration-300 hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="h-4 w-4 status-purple-table-text" />
                Ask
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
