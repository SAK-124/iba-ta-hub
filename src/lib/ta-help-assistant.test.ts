import { afterEach, describe, expect, it, vi } from 'vitest';

import {
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
    expect(headings.some((heading) => heading.includes('Runbook: Create a Session Before Any Attendance Work'))).toBe(true);
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

    await requestTaHelpAnswer({
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

    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
      messages: Array<{ role: string; content: string }>;
    };
    const currentQuestionCount = requestBody.messages.filter(
      (message) => message.role === 'user' && message.content === 'How do I process a Zoom CSV?',
    ).length;

    expect(currentQuestionCount).toBe(1);
  });
});
