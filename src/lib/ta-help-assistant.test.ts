import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_OPENROUTER_HELP_MODEL,
  FALLBACK_OPENROUTER_HELP_MODEL,
  getConfiguredHelpModel,
  getGuideChunks,
  requestTaHelpAnswer,
  retrieveRelevantGuideChunks,
} from './ta-help-assistant';

describe('ta help assistant guide retrieval', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('loads the markdown guide into heading-based chunks', () => {
    const chunks = getGuideChunks();

    expect(chunks.length).toBeGreaterThan(5);
    expect(chunks.some((chunk) => chunk.heading.includes('Runbook: Process a Zoom CSV'))).toBe(true);
  });

  it('prefers attendance workflow chunks for zoom attendance questions', () => {
    const chunks = retrieveRelevantGuideChunks(
      'How do I mark attendance from a Zoom CSV and handle naming penalties?',
      'Live Attendance',
    );

    const headings = chunks.map((chunk) => chunk.heading).join(' | ');
    expect(headings).toContain('Runbook: Mark Attendance After Zoom Processing');
    expect(headings).toContain('Runbook: Process a Zoom CSV and Turn It Into Attendance');
  });

  it('biases retrieval toward the current module without hard filtering', () => {
    const chunks = retrieveRelevantGuideChunks(
      'How do I create a session before processing Zoom attendance?',
      'Zoom Processor',
    );

    const headings = chunks.map((chunk) => chunk.heading);
    expect(headings.length).toBeGreaterThan(0);
    expect(headings.some((heading) => /session|zoom/i.test(heading))).toBe(true);
  });

  it('uses Liquid 1.2B as the default help model', () => {
    vi.stubEnv('VITE_OPENROUTER_MODEL', '');
    expect(getConfiguredHelpModel()).toBe(DEFAULT_OPENROUTER_HELP_MODEL);
    expect(DEFAULT_OPENROUTER_HELP_MODEL).toBe('liquid/lfm-2.5-1.2b-instruct:free');
  });

  it('sends the current user question only once to OpenRouter', async () => {
    vi.stubEnv('VITE_OPENROUTER_API_KEY', 'test-key');
    vi.stubEnv('VITE_OPENROUTER_MODEL', 'liquid/lfm-2.5-1.2b-instruct:free');

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: 'Go to Zoom Processor and click `SELECT CSV`.',
            },
          },
        ],
      }),
    });

    vi.stubGlobal('fetch', fetchMock);

    const result = await requestTaHelpAnswer({
      question: 'How do I process a Zoom CSV?',
      snapshot: {
        moduleId: 'zoom',
        moduleTitle: 'Zoom Processor',
        moduleStage: 'Zoom Processor · upload step',
        visibleControls: ['SELECT CSV', 'Analyze Matrix'],
      },
      history: [
        { role: 'assistant', content: 'Previous answer' },
        { role: 'user', content: 'How do I process a Zoom CSV?' },
      ],
    });

    expect(result.answer).toBe('Go to Zoom Processor and click `SELECT CSV`.');
    expect(result.model).toBe('liquid/lfm-2.5-1.2b-instruct:free');
    expect(result.usedFallback).toBe(false);

    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
      messages: Array<{ role: string; content: string }>;
    };
    const currentQuestionCount = requestBody.messages.filter(
      (message) => message.role === 'user' && message.content === 'How do I process a Zoom CSV?',
    ).length;

    expect(currentQuestionCount).toBe(1);
    expect(requestBody.messages.filter((message) => message.content.includes('You are Auxilium')).length).toBe(1);
    expect(requestBody.messages.some((message) => message.content.startsWith('CURRENT_STATE'))).toBe(true);
    expect(requestBody.messages.some((message) => message.content.startsWith('CONVERSATION_MEMORY'))).toBe(true);
  });

  it('retries on provider failure with the Liquid fallback model', async () => {
    vi.stubEnv('VITE_OPENROUTER_API_KEY', 'test-key');
    vi.stubEnv('VITE_OPENROUTER_MODEL', 'google/gemma-3-4b-it:free');

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => 'Provider returned error: temporarily rate-limited',
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: 'Click `SELECT CSV` in Zoom Processor.',
              },
            },
          ],
        }),
      });

    vi.stubGlobal('fetch', fetchMock);

    const result = await requestTaHelpAnswer({
      question: 'How do I process a Zoom CSV?',
      snapshot: {
        moduleId: 'zoom',
        moduleTitle: 'Zoom Processor',
        moduleStage: 'Zoom Processor · upload step',
        visibleControls: ['SELECT CSV', 'Analyze Matrix'],
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).model).toBe('google/gemma-3-4b-it:free');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string).model).toBe(FALLBACK_OPENROUTER_HELP_MODEL);
    expect(result.usedFallback).toBe(true);
    expect(result.model).toBe(FALLBACK_OPENROUTER_HELP_MODEL);
  });
});
