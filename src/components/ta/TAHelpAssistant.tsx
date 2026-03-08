import { useEffect, useRef, useState } from 'react';
import { Bot, Loader2, MessageSquareText, Minimize2, RotateCcw, Send, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ta/ui/button';
import { Textarea } from '@/components/ta/ui/textarea';
import {
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
        <strong key={`${segment}-${index}`} className="font-extrabold status-white-table-text">
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
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!scrollRef.current) {
      return;
    }

    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isSending]);

  const resetConversation = () => {
    setDraft('');
    setMessages(getInitialMessages(configured));
    setConversationIntentContext(null);
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
      setMessages((current) => [...current, createAssistantMessage(currentScreenAnswer)]);
      return;
    }

    if (!isTaPortalHelpQuestion(question, snapshot)) {
      setMessages((current) => [
        ...current,
        createAssistantMessage(
          getTaPortalRedirectResponse(),
        ),
      ]);
      return;
    }

    if (!configured) {
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
      const answer = await requestTaHelpAnswer({
        question,
        snapshot,
        history: messages,
      });

      setMessages((current) => [...current, createAssistantMessage(answer)]);
    } catch (error: unknown) {
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
    <>
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="group fixed bottom-6 right-6 z-40 neo-btn neo-out rounded-full px-4 py-2.5 text-xs font-black tracking-[0.18em] uppercase"
        aria-label={TA_CHAT_LAUNCHER_LABEL}
      >
        <span className="inline-flex items-center gap-2 text-debossed-sm">
          <Sparkles className="h-4 w-4 status-purple-table-text status-purple-breathe" />
          <span className="status-purple-table-text status-purple-breathe">{TA_CHAT_LAUNCHER_LABEL}</span>
        </span>
      </button>

      {isOpen && (
        <div className="fixed bottom-20 right-6 z-40 w-[360px] max-w-[calc(100vw-1.5rem)] max-sm:left-3 max-sm:right-3 max-sm:w-auto">
          <div className="neo-out overflow-hidden rounded-[26px] border border-[#141517]">
            <div className="border-b border-[#17181b] px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="neo-in flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
                    <Bot className="h-[18px] w-[18px] text-debossed-sm status-all-text" />
                  </div>

                  <div className="min-w-0">
                    <h2 className="text-left text-lg font-extrabold tracking-tight text-debossed">
                      {TA_CHAT_NAME}
                    </h2>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={resetConversation}
                    className="neo-in flex h-9 w-9 items-center justify-center rounded-full text-debossed-sm transition-all duration-300 hover:translate-y-[-1px]"
                    aria-label="Clear chat"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="neo-in flex h-9 w-9 items-center justify-center rounded-full text-debossed-sm transition-all duration-300 hover:translate-y-[-1px]"
                    aria-label="Minimize help assistant"
                  >
                    <Minimize2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {moduleStage ? (
                <div className="mt-3 inline-flex max-w-full rounded-full neo-in px-3 py-1 text-[11px] text-debossed-sm">
                  <span className="truncate">{moduleStage}</span>
                </div>
              ) : null}
            </div>

            <div className="flex h-[520px] min-h-0 flex-col max-sm:h-[68vh]">
              <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                <div className="space-y-4">
                  {messages.map((message, index) => (
                    <div
                      key={`${message.role}-${index}`}
                      className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[92%] rounded-[20px] px-4 py-3 ${
                          message.role === 'user'
                            ? 'neo-in border border-[#17181b]'
                            : 'neo-out border border-[#141517]'
                        }`}
                      >
                        <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-debossed-sm">
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
                        <div className="text-sm text-debossed">{renderMessageContent(message.content)}</div>
                      </div>
                    </div>
                  ))}

                  {isSending && (
                    <div className="flex justify-start">
                      <div className="neo-out rounded-[24px] border border-[#141517] px-4 py-3">
                        <div className="flex items-center gap-2 text-sm text-debossed">
                          <Loader2 className="h-4 w-4 animate-spin status-all-text" />
                          Building a step-by-step answer...
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="shrink-0 border-t border-[#17181b] px-4 py-3">
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void submitQuestion(draft);
                  }}
                  className="space-y-3"
                >
                  <Textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        void submitQuestion(draft);
                      }
                    }}
                    placeholder="Start typing or ask for help"
                    className="min-h-[88px] rounded-[18px] border-[#17181b] bg-transparent text-debossed placeholder:text-[#5f6770] focus-visible:ring-0"
                  />
                  <div className="flex justify-end">
                    <Button type="submit" disabled={isSending || !draft.trim()} className="rounded-full px-5">
                      {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      Ask
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
