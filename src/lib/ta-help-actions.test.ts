import { describe, expect, it } from 'vitest';

import {
  buildCurrentScreenAnswer,
  getScreenContextSummary,
  planHelpAssistantAction,
} from './ta-help-actions';

describe('ta-help-actions', () => {
  it('builds a Zoom upload screen answer for vague next-step questions', () => {
    const answer = buildCurrentScreenAnswer(
      'what do i click now',
      'Zoom Processor',
      'Zoom Processor · upload step',
    );

    expect(answer).toContain('`SELECT CSV`');
    expect(answer).toContain('Analyze Matrix');
  });

  it('describes Consolidated View for vague screen questions', () => {
    const answer = buildCurrentScreenAnswer(
      'whats this',
      'Consolidated View',
      'Consolidated View · table review',
    );

    expect(answer).toContain('full attendance table');
    expect(answer).toContain('`Search...`');
    expect(answer).toContain('`Sync Sheet`');
  });

  it('parses safe navigation and preparation actions only for direct instructions', () => {
    expect(planHelpAssistantAction('go to Zoom Processor')?.action).toEqual({
      type: 'switch-attendance-tab',
      tab: 'zoom',
    });

    expect(planHelpAssistantAction('switch to Live Attendance')?.action).toEqual({
      type: 'switch-attendance-tab',
      tab: 'attendance',
    });

    expect(planHelpAssistantAction('create a new session for today')?.action).toEqual({
      type: 'session-command',
      command: {
        kind: 'prepare-create-session',
        selectedDate: new Date().toISOString().slice(0, 10),
        sessionNumberStrategy: 'next',
        focusField: 'start-time',
      },
    });

    expect(planHelpAssistantAction('How do I create a new session for today?')).toBeNull();
  });

  it('infers natural language add-student prep commands', () => {
    const plan = planHelpAssistantAction('take me to where i can add a student named ahsan');

    expect(plan?.action).toEqual({
      type: 'roster-command',
      command: {
        kind: 'open-add-student',
        student: {
          student_name: 'ahsan',
          erp: undefined,
          class_no: undefined,
        },
        focusField: 'erp',
      },
    });
    expect(plan?.response).toContain('Add to Roster');
  });

  it('strips action suffixes from warned-student commands', () => {
    const plan = planHelpAssistantAction('mark zayed as warned');

    expect(plan?.action).toEqual({
      type: 'rule-exceptions-command',
      command: {
        kind: 'mark-warned',
        query: 'zayed',
      },
    });
    expect(plan?.response).toContain('`zayed`');
    expect(plan?.response).not.toContain('`zayed as warned`');
  });

  it('resolves zoom-attendance workflow-start requests to the zoom entrypoint', () => {
    const plan = planHelpAssistantAction('i wanna do zoom attendance');

    expect(plan?.action).toEqual({
      type: 'switch-attendance-tab',
      tab: 'zoom',
    });
    expect(plan?.rememberedIntent).toMatchObject({
      kind: 'workflow',
      workflowId: 'zoom-attendance',
      moduleId: 'zoom',
      moduleTitle: 'Zoom Processor',
    });
    expect(plan?.response).toContain('Switched to `Zoom Processor`.');
    expect(plan?.response).toContain('Click `SELECT CSV` first.');
    expect(plan?.response).not.toContain('Roster Management');
    expect(plan?.response).not.toContain('Add Student');
  });

  it('reuses the remembered workflow target for follow-up navigation', () => {
    const plan = planHelpAssistantAction('take me there', null, {
      kind: 'workflow',
      workflowId: 'zoom-attendance',
      moduleId: 'zoom',
      moduleTitle: 'Zoom Processor',
      nextAction: {
        type: 'switch-attendance-tab',
        tab: 'zoom',
      },
    });

    expect(plan?.action).toEqual({
      type: 'switch-attendance-tab',
      tab: 'zoom',
    });
    expect(plan?.response).toContain('Switched to `Zoom Processor`.');
    expect(plan?.response).toContain('Click `SELECT CSV` first.');
  });

  it('asks for a concrete target when a follow-up has no remembered intent', () => {
    const plan = planHelpAssistantAction('take me there');

    expect(plan?.action).toBeNull();
    expect(plan?.response).toContain('Do you want `Zoom Processor`, `Live Attendance`, or `Session Management`?');
  });

  it('reuses the remembered roster add-student target for follow-up navigation', () => {
    const plan = planHelpAssistantAction('take me there', null, {
      kind: 'workflow',
      workflowId: 'roster-add-student',
      moduleId: 'roster',
      moduleTitle: 'Roster Management',
      entityQuery: 'ahsan',
      nextAction: {
        type: 'roster-command',
        command: {
          kind: 'open-add-student',
          student: {
            student_name: 'ahsan',
          },
          focusField: 'erp',
        },
      },
    });

    expect(plan?.action).toEqual({
      type: 'roster-command',
      command: {
        kind: 'open-add-student',
        student: {
          student_name: 'ahsan',
        },
        focusField: 'erp',
      },
    });
    expect(plan?.response).toContain('Opened `Roster Management` and continued the `Add Student` flow.');
  });

  it('returns exact screen context summaries for current module stages', () => {
    const summary = getScreenContextSummary('Consolidated View', 'Consolidated View · search active');

    expect(summary?.title).toBe('Consolidated View');
    expect(summary?.primaryAction).toBe('Search...');
    expect(summary?.visibleControls).toContain('Sync Sheet');
  });

  it('prepares a group assignment workflow from natural language', () => {
    const plan = planHelpAssistantAction('move student 26611 to group 4');

    expect(plan?.action).toEqual({
      type: 'groups-command',
      command: {
        kind: 'prepare-assign-student',
        query: '26611',
        groupNumber: 4,
      },
    });
    expect(plan?.response).toContain('Opened `Groups`.');
    expect(plan?.response).toContain('Group 4');
  });

  it('prepares a grouped late-day recompute request', () => {
    const plan = planHelpAssistantAction('recompute group 3 late days');

    expect(plan?.action).toEqual({
      type: 'groups-command',
      command: {
        kind: 'prepare-recompute-group',
        groupNumber: 3,
      },
    });
    expect(plan?.response).toContain('Recompute Late Days');
  });
});
