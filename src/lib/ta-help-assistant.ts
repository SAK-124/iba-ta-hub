import guideMarkdown from '../../docs/ta-portal-features-guide.md?raw';
import {
  getScreenContextSummary,
  type HelpContextSnapshot,
  isContextualPortalQuestion,
} from './ta-help-actions';

export const DEFAULT_OPENROUTER_HELP_MODEL = 'liquid/lfm-2.5-1.2b-instruct:free';
const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';
export const TA_CHAT_NAME = 'Auxilium';
export const TA_CHAT_LAUNCHER_LABEL = 'Chat with Aux';

const RETRIEVAL_LIMIT = 4;
const MODULE_ALIASES: Record<string, string[]> = {
  'TA Dashboard': ['ta dashboard', 'dashboard'],
  'Attendance Workspace': ['attendance workspace', 'zoom processor', 'live attendance', 'attendance'],
  'Zoom Processor': ['zoom processor', 'zoom csv', 'zoom file', 'process zoom', 'zoom'],
  'Live Attendance': ['live attendance', 'mark attendance', 'attendance list', 'absent erp', 'naming penalty'],
  'Roster Management': ['roster management', 'roster', 'import roster', 'student roster'],
  'Consolidated View': ['consolidated view', 'full attendance', 'sync sheet', 'public sheet'],
  'Session Management': ['session management', 'create session', 'edit session', 'session'],
  'Rule Exceptions': ['rule exceptions', 'exception', 'camera exception'],
  'Late Days': ['late days', 'late day', 'claim', 'grant late days', 'assignment deadline'],
  'Issue Queue': ['issue queue', 'ticket', 'resolve ticket', 'student complaint'],
  'Export Data': ['export data', 'export attendance', 'csv export'],
  'Lists & Settings': ['lists and settings', 'settings', 'ta management', 'submission list', 'password'],
};

export interface HelpAssistantMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface GuideChunk {
  id: string;
  heading: string;
  content: string;
}

interface OpenRouterChoiceMessage {
  message?: {
    content?: string;
  };
}

interface OpenRouterResponse {
  choices?: OpenRouterChoiceMessage[];
}

const sanitizeModel = (value: string | undefined) => value?.trim() || DEFAULT_OPENROUTER_HELP_MODEL;

const normalizeText = (value: string) => value.toLowerCase();

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'do',
  'does',
  'for',
  'good',
  'how',
  'i',
  'in',
  'is',
  'it',
  'me',
  'of',
  'on',
  'or',
  'the',
  'to',
  'what',
  'where',
  'why',
  'you',
]);

const tokenize = (value: string) =>
  normalizeText(value)
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token));

const buildGuideChunks = (markdown: string): GuideChunk[] => {
  const lines = markdown.split('\n');
  const chunks: GuideChunk[] = [];

  let currentHeading = 'Guide Overview';
  let currentSectionHeading = 'Guide Overview';
  let currentLines: string[] = [];

  const pushChunk = () => {
    const content = currentLines.join('\n').trim();
    if (!content) {
      return;
    }

    const id = `${chunks.length + 1}-${currentHeading.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    chunks.push({ id, heading: currentHeading, content });
  };

  for (const line of lines) {
    const sectionHeadingMatch = line.match(/^##\s+(.*)$/);
    if (sectionHeadingMatch) {
      pushChunk();
      currentSectionHeading = sectionHeadingMatch[1].trim();
      currentHeading = currentSectionHeading;
      currentLines = [line];
      continue;
    }

    const subsectionHeadingMatch = line.match(/^###\s+(.*)$/);
    if (subsectionHeadingMatch) {
      pushChunk();
      currentHeading = `${currentSectionHeading} / ${subsectionHeadingMatch[1].trim()}`;
      currentLines = [line];
      continue;
    }

    currentLines.push(line);
  }

  pushChunk();
  return chunks;
};

const GUIDE_CHUNKS = buildGuideChunks(guideMarkdown);

export const getGuideChunks = () => GUIDE_CHUNKS;

const scoreChunk = (
  chunk: GuideChunk,
  question: string,
  moduleTitle?: string | null,
  moduleStage?: string | null,
  snapshot?: HelpContextSnapshot | null,
) => {
  const haystack = normalizeText(`${chunk.heading}\n${chunk.content}`);
  const questionTokens = tokenize(question);
  let score = 0;

  for (const token of questionTokens) {
    if (haystack.includes(token)) {
      score += chunk.heading.toLowerCase().includes(token) ? 5 : 2;
    }
  }

  if (moduleTitle) {
    const aliases = MODULE_ALIASES[moduleTitle] ?? [moduleTitle.toLowerCase()];
    for (const alias of aliases) {
      if (haystack.includes(alias.toLowerCase())) {
        score += 6;
      }
    }
  }

  if (moduleStage) {
    const stageTokens = tokenize(moduleStage);
    for (const token of stageTokens) {
      if (haystack.includes(token)) {
        score += chunk.heading.toLowerCase().includes(token) ? 4 : 2;
      }
    }
  }

  if (isContextualPortalQuestion(question, snapshot ?? moduleTitle, moduleStage)) {
    if (/button and stage reference|what do i click now|what do i press first|what's this|what is this|safe action/i.test(haystack)) {
      score += 12;
    }
    if (moduleTitle && haystack.includes(moduleTitle.toLowerCase())) {
      score += 8;
    }
  }

  if (snapshot?.visibleControls?.length) {
    for (const control of snapshot.visibleControls) {
      const normalizedControl = control.toLowerCase();
      if (haystack.includes(normalizedControl)) {
        score += 3;
      }
    }
  }

  if (/step|how|where|what do i do|workflow|runbook|mark attendance|zoom/i.test(question)) {
    if (/runbook|step-by-step|step by step|workflow|exact sequence/i.test(haystack)) {
      score += 4;
    }
  }

  if (/mark attendance|zoom csv|naming penalty|session/i.test(question) && /class-day attendance operation/i.test(haystack)) {
    score += 8;
  }

  if (
    /create/.test(question.toLowerCase()) &&
    /session/.test(question.toLowerCase()) &&
    /zoom/.test(question.toLowerCase()) &&
    /session management|create session|before any attendance work/.test(haystack)
  ) {
    score += 10;
  }

  return score;
};

export const retrieveRelevantGuideChunks = (
  question: string,
  moduleTitle?: string | null,
  moduleStage?: string | null,
  snapshot?: HelpContextSnapshot | null,
  limit = RETRIEVAL_LIMIT,
) =>
  GUIDE_CHUNKS
    .map((chunk) => ({
      chunk,
      score: scoreChunk(chunk, question, moduleTitle, moduleStage, snapshot),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((entry) => entry.chunk);

const TA_PORTAL_KEYWORDS = [
  'ta portal',
  'attendance',
  'zoom',
  'session',
  'roster',
  'late day',
  'ticket',
  'issue queue',
  'rule exception',
  'consolidated',
  'export',
  'settings',
  'naming penalty',
  'absent erp',
];

const TA_PORTAL_REDIRECT_RESPONSE =
  'I only handle TA portal guidance. Ask me about a TA workflow such as Zoom Processor, Live Attendance, Consolidated View, Session Management, Rule Exceptions, Late Days, Issue Queue, Export Data, or Lists & Settings.';

export const isTaPortalHelpQuestion = (
  question: string,
  snapshotOrModuleTitle?: HelpContextSnapshot | string | null,
  moduleStage?: string | null,
) => {
  const snapshot = typeof snapshotOrModuleTitle === 'string' ? null : snapshotOrModuleTitle;
  const moduleTitle = typeof snapshotOrModuleTitle === 'string' ? snapshotOrModuleTitle : snapshotOrModuleTitle?.moduleTitle;
  const resolvedStage = typeof snapshotOrModuleTitle === 'string' ? moduleStage : snapshotOrModuleTitle?.moduleStage;

  if (isContextualPortalQuestion(question, snapshot ?? moduleTitle, resolvedStage)) {
    return true;
  }

  const normalized = normalizeText(question);
  if (TA_PORTAL_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return true;
  }

  const bestScoreWithoutModuleBias = GUIDE_CHUNKS.reduce((maxScore, chunk) => {
    const nextScore = scoreChunk(chunk, question, null, null, null);
    return Math.max(maxScore, nextScore);
  }, 0);

  if (bestScoreWithoutModuleBias >= 8) {
    return true;
  }

  if (!moduleTitle) {
    return false;
  }

  const bestScoreWithModuleBias = GUIDE_CHUNKS.reduce((maxScore, chunk) => {
    const nextScore = scoreChunk(chunk, question, moduleTitle, resolvedStage, snapshot);
    return Math.max(maxScore, nextScore);
  }, 0);

  return bestScoreWithoutModuleBias >= 4 && bestScoreWithModuleBias >= 10;
};

export const getTaPortalRedirectResponse = () => TA_PORTAL_REDIRECT_RESPONSE;

const buildSystemPrompt = (moduleTitle?: string | null, moduleStage?: string | null, snapshot?: HelpContextSnapshot | null) => {
  const moduleContext = moduleTitle
    ? `Current TA dashboard context: ${moduleTitle}. Use it as a relevance hint, not a hard restriction.`
    : 'Current TA dashboard context: general portal overview.';
  const stageContext = moduleStage
    ? `Current module stage: ${moduleStage}. Treat it as the active screen and answer from it first for vague questions.`
    : 'Current module stage: general overview.';

  return [
    `You are ${TA_CHAT_NAME} for the IBA TA Hub TA Portal.`,
    'You are only allowed to answer questions that are directly related to the TA portal, its features, its workflows, and its operation.',
    'If the user asks about anything outside the TA portal, do not answer that question directly.',
    'Instead, briefly say that you only handle TA portal guidance and invite them to ask about a TA portal workflow or module.',
    'Never provide general academic, personal, career, health, finance, coding, or world-knowledge advice.',
    'Answer only from the provided guide excerpts and current portal behavior.',
    'If the guide does not support a claim, say the feature is not currently documented or not clearly implemented.',
    'If asked who created you, say: Saboor Ali Khan (26475).',
    'When the user asks how to do something, answer in this format:',
    '1. Where to go',
    '2. What to do',
    '3. What to check before saving',
    '4. What to do next',
    'Prefer numbered steps.',
    'Prefer module names exactly as shown in the UI.',
    'If the user asks a vague on-screen question like "what do I click now", "what do I press first", "what now", or "what is this", answer from the current module and current module stage first.',
    'For vague on-screen questions, do not jump to a different module unless the current screen explicitly requires that dependency and you say so clearly.',
    'For chained workflows, include dependencies such as session creation before Zoom processing and Zoom processing before attendance marking.',
    'If the user says they want to do a workflow, start them at the workflow entry module first and do not expand into optional side branches unless they asked for them or the current context requires them.',
    'Do not invent hidden admin tools, backend jobs, undocumented features, or general world knowledge.',
    'If the current screen provides visible controls or an open dialog, use those controls as the first interpretation anchor.',
    moduleContext,
    stageContext,
    snapshot?.openSurface ? `Open surface: ${snapshot.openSurface}.` : '',
  ].join('\n');
};

const buildGuideContext = (
  question: string,
  moduleTitle?: string | null,
  moduleStage?: string | null,
  snapshot?: HelpContextSnapshot | null,
) => {
  const chunks = retrieveRelevantGuideChunks(question, moduleTitle, moduleStage, snapshot);
  if (chunks.length === 0) {
    return `No relevant guide chunks were found.\n\nFallback guide heading list:\n${GUIDE_CHUNKS.map((chunk) => `- ${chunk.heading}`).join('\n')}`;
  }

  return chunks
    .map((chunk) => `### ${chunk.heading}\n${chunk.content}`)
    .join('\n\n---\n\n');
};

export const getConfiguredHelpModel = () => sanitizeModel(import.meta.env.VITE_OPENROUTER_MODEL);

export const isHelpAssistantConfigured = () => Boolean(import.meta.env.VITE_OPENROUTER_API_KEY?.trim());

export async function requestTaHelpAnswer(params: {
  question: string;
  snapshot?: HelpContextSnapshot | null;
  history?: HelpAssistantMessage[];
}) {
  const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('The TA help assistant is not configured yet. Add VITE_OPENROUTER_API_KEY to enable it.');
  }

  const trimmedQuestion = params.question.trim();
  const recentHistory = (params.history ?? [])
    .slice(-8)
    .filter((entry, index, entries) => !(
      index === entries.length - 1 &&
      entry.role === 'user' &&
      entry.content.trim() === trimmedQuestion
    ))
    .map((entry) => ({
    role: entry.role,
    content: entry.content,
    }));

  const moduleTitle = params.snapshot?.moduleTitle ?? 'TA Dashboard';
  const moduleStage = params.snapshot?.moduleStage ?? 'General overview';
  const guideContext = buildGuideContext(params.question, moduleTitle, moduleStage, params.snapshot);
  const screenContext = getScreenContextSummary(params.snapshot ?? moduleTitle, moduleStage);

  const response = await fetch(OPENROUTER_CHAT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': window.location.origin,
      'X-Title': 'IBA TA Hub Help Assistant',
    },
    body: JSON.stringify({
      model: getConfiguredHelpModel(),
      temperature: 0.1,
      max_tokens: 700,
      messages: [
        {
          role: 'system',
          content: buildSystemPrompt(moduleTitle, moduleStage, params.snapshot),
        },
        {
          role: 'system',
          content: `Current in-app context:\nModule: ${moduleTitle}\nStage: ${moduleStage}`,
        },
        ...(screenContext
          ? [
              {
                role: 'system' as const,
                content: `Current visible screen summary:\nScreen: ${screenContext.title}\nDescription: ${screenContext.description}\nVisible controls: ${screenContext.visibleControls.join(', ') || 'None provided'}\nPrimary control: ${screenContext.primaryAction ?? 'Not specified'}\nOpen surface: ${params.snapshot?.openSurface ?? 'None'}\nSearch query: ${params.snapshot?.searchQuery ?? 'None'}\nFilters: ${params.snapshot?.filters ? JSON.stringify(params.snapshot.filters) : 'None'}`,
              },
            ]
          : []),
        {
          role: 'system',
          content: `Guide excerpts:\n\n${guideContext}`,
        },
        ...recentHistory,
        {
          role: 'user',
          content: params.question,
        },
      ],
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `OpenRouter request failed with status ${response.status}`);
  }

  const data = (await response.json()) as OpenRouterResponse;
  const answer = data.choices?.[0]?.message?.content?.trim();
  if (!answer) {
    throw new Error('OpenRouter returned an empty response.');
  }

  if (!isTaPortalHelpQuestion(answer, params.snapshot ?? moduleTitle, moduleStage)) {
    return TA_PORTAL_REDIRECT_RESPONSE;
  }

  return answer;
}

export function getSuggestedHelpPrompts(moduleTitle?: string | null) {
  const generalPrompts = [
    'How do I mark attendance from a Zoom CSV from start to finish?',
    'How do I create a session before processing Zoom attendance?',
    'How do I fix a naming penalty after attendance is saved?',
    'How do I resolve a ticket and turn it into a rule exception?',
  ];

  const modulePrompts: Record<string, string[]> = {
    'Zoom Processor': [
      'How do I process a Zoom CSV and move it into attendance marking?',
      'What should I review in Matches, Issues, Unidentified, and Penalties?',
      'What do I do if the Zoom absent list looks wrong?',
    ],
    'Live Attendance': [
      'How do I mark attendance after Zoom processing?',
      'How do I overwrite existing attendance safely?',
      'How do I fix a wrong status or naming penalty?',
    ],
    'Session Management': [
      'How do I create a session before any attendance work?',
      'How do I edit a session without losing attendance?',
      'What do I do if the session is missing in Live Attendance?',
    ],
    'Issue Queue': [
      'How do I resolve a ticket from start to finish?',
      'How do I reply to a ticket without closing it?',
      'How do I convert a ticket into a rule exception?',
    ],
    'Late Days': [
      'How do I create a late-day assignment?',
      'How do I grant bonus late days to a student?',
      'How do I inspect and fix late-day claims?',
    ],
    'Lists & Settings': [
      'How do I disable ticketing or change global settings?',
      'How do I change my TA password?',
      'How do I manage TA access and submission options?',
    ],
  };

  return moduleTitle && modulePrompts[moduleTitle] ? modulePrompts[moduleTitle] : generalPrompts;
}
