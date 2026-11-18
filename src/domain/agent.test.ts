import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AGENT_SETTINGS,
  agentSettingsProblem,
  describeColumns,
  enteredColumnOn,
  composeAgentPrompt,
  normaliseAgentSettings,
  sanitiseAgentSettings,
  tasksForAgent,
  type AgentSettings,
} from './agent';
import type { HistoryEntry } from './model';
import { makeTask } from './testHelpers';

const SETTINGS: AgentSettings = {
  terminal: 'Ghostty',
  command: 'claude-personal',
  prompt: 'List my work.',
  columns: ['Done'],
};

function movedToDone(at: string, from = 'In progress'): HistoryEntry {
  return {
    at,
    text: `Moved from ${from} to Done`,
    ledger: { v: 1, at: `${at.replace(' ', 'T')}:00`, changes: [{ field: 'status', from, to: 'Done' }] },
  };
}

describe('agent settings', () => {
  it('accepts a terminal, a one-line command and a prompt', () => {
    expect(agentSettingsProblem(SETTINGS)).toBeNull();
    expect(agentSettingsProblem({ ...SETTINGS, prompt: '' })).toBeNull();
    expect(agentSettingsProblem({ ...SETTINGS, command: 'gemini -i {prompt}' })).toBeNull();
  });

  it.each<[string, Partial<AgentSettings>, RegExp]>([
    ['an empty command', { command: '   ' }, /Enter the command that starts your agent/],
    ['a command over two lines', { command: 'claude\nrm -rf ~' }, /must fit on one line/],
    ['a very long command', { command: 'x'.repeat(501) }, /at most 500 characters/],
    ['a very long prompt', { prompt: 'x'.repeat(20_001) }, /at most 20,000 characters/],
    ['an unknown terminal', { terminal: 'Hyper' as AgentSettings['terminal'] }, /Ghostty, Terminal/],
    ['no column', { columns: [] }, /Choose at least one column/],
    ['an unknown column', { columns: ['Pending' as AgentSettings['columns'][number]] }, /Choose columns from: To do/],
  ])('rejects %s in plain words', (_case, patch, message) => {
    expect(agentSettingsProblem({ ...SETTINGS, ...patch })).toMatch(message);
  });

  it('trims the command and the prompt, keeps the prompt to \\n line breaks, and the columns in board order', () => {
    expect(
      normaliseAgentSettings({
        terminal: 'Terminal',
        command: '  codex ',
        prompt: '\r\nOne\r\nTwo\n ',
        columns: ['Done', 'In progress', 'Done'],
      }),
    ).toEqual({ terminal: 'Terminal', command: 'codex', prompt: 'One\nTwo', columns: ['In progress', 'Done'] });
  });

  it('reads what settings.json held, falling back field by field', () => {
    expect(sanitiseAgentSettings(undefined)).toEqual(DEFAULT_AGENT_SETTINGS);
    expect(
      sanitiseAgentSettings({
        terminal: 'Terminal',
        command: ' codex ',
        prompt: 7,
        columns: ['Done', 'Pending', 'To do'],
      }),
    ).toEqual({
      terminal: 'Terminal',
      command: 'codex',
      prompt: DEFAULT_AGENT_SETTINGS.prompt,
      columns: ['To do', 'Done'],
    });
    expect(sanitiseAgentSettings({ terminal: 'Hyper', command: '', prompt: 'Mine', columns: [] })).toEqual({
      terminal: 'Ghostty',
      command: 'claude',
      prompt: 'Mine',
      columns: ['Done'],
    });
  });

  it('describes the columns in board order', () => {
    expect(describeColumns(['Done'])).toBe('Done');
    expect(describeColumns(['Done', 'In progress'])).toBe('In progress and Done');
    expect(describeColumns(['Done', 'To do', 'With client'])).toBe('To do, With client and Done');
  });

  it('hands the agent only the live tasks in its columns', () => {
    const tasks = [
      { id: 'a', status: 'Done', isArchived: false },
      { id: 'b', status: 'Done', isArchived: true },
      { id: 'c', status: 'In progress', isArchived: false },
      { id: 'd', status: 'To do', isArchived: false },
    ] as const;
    expect(tasksForAgent(tasks, ['In progress', 'Done']).map((task) => task.id)).toEqual(['a', 'c']);
  });
});

describe('enteredColumnOn', () => {
  it('is the date of the latest entry that put the task in Done', () => {
    const history = [
      movedToDone('2026-11-10 09:00'),
      { at: '2026-11-11 09:00', text: 'Moved from Done to In progress' },
      movedToDone('2026-11-14 16:20'),
      { at: '2026-11-15 08:00', text: 'Comment added' },
    ];
    expect(enteredColumnOn({ history, updated: '2026-11-15T08:00:00', status: 'Done' })).toBe('2026-11-14');
  });

  it('reads legacy entries and tasks created in Done', () => {
    expect(
      enteredColumnOn({
        history: [{ at: '2026-11-03 10:00', text: 'Moved from To do to Done' }],
        updated: '2026-11-09T10:00:00',
        status: 'Done',
      }),
    ).toBe('2026-11-03');
    expect(
      enteredColumnOn({
        history: [{ at: '2026-11-04 10:00', text: 'Created in Done' }],
        updated: '2026-11-09T10:00:00',
        status: 'Done',
      }),
    ).toBe('2026-11-04');
  });

  it('finds when a task entered any other column too', () => {
    const history = [
      { at: '2026-11-10 09:00', text: 'Created in To do' },
      { at: '2026-11-12 11:00', text: 'Moved from To do to With client' },
      { at: '2026-11-13 11:00', text: 'Comment added' },
    ];
    expect(enteredColumnOn({ history, updated: '2026-11-13T11:00:00', status: 'With client' })).toBe('2026-11-12');
  });

  it('falls back to the date it was last updated when the history does not say', () => {
    expect(
      enteredColumnOn({
        history: [{ at: '', text: 'Moved from To do to Done' }],
        updated: '2026-11-09T10:00:00',
        status: 'Done',
      }),
    ).toBe('2026-11-09');
  });
});

describe('composeAgentPrompt', () => {
  const report = makeTask({
    id: 'tasks/Acme/Monthly report.md',
    title: 'Monthly report',
    project: 'Acme',
    status: 'Done',
    created: '2026-11-02T09:00:00',
    due: '2026-11-15',
    description: 'Collected the figures.\n\nSent the PDF.',
    comments: [{ at: '2026-11-14 16:20', text: 'Client happy\nwith the layout' }],
    history: [movedToDone('2026-11-14 16:20')],
  });
  const login = makeTask({
    id: 'tasks/beta/Fix login.md',
    title: 'Fix login',
    project: 'beta',
    status: 'Done',
    created: '2026-11-05T09:00:00',
    history: [movedToDone('2026-11-12 11:00')],
  });
  const invoice = makeTask({
    id: 'tasks/Acme/Invoice.md',
    title: 'Invoice',
    project: 'Acme',
    status: 'Done',
    created: '2026-11-01T09:00:00',
    history: [movedToDone('2026-11-11 10:00')],
  });
  const admin = makeTask({
    id: 'tasks/Expenses.md',
    title: 'Expenses',
    status: 'Done',
    created: '2026-11-06T09:00:00',
    history: [movedToDone('2026-11-13 10:00')],
  });

  it('puts the prompt first, then the Done tasks by project, No project last, each in completion order', () => {
    expect(composeAgentPrompt('  List my work.  ', [login, admin, report, invoice], ['Done'])).toBe(
      [
        'List my work.',
        '',
        '---',
        '',
        'The 4 tasks in Done on my mboard board follow, grouped by project. Each file path is relative to the current folder, which is the board folder.',
        '',
        '## Acme',
        '',
        '### Invoice',
        '- Completed: 2026-11-11',
        '- Created: 2026-11-01',
        '- File: tasks/Acme/Invoice.md',
        '',
        '### Monthly report',
        '- Completed: 2026-11-14',
        '- Created: 2026-11-02',
        '- Due: 2026-11-15',
        '- File: tasks/Acme/Monthly report.md',
        '',
        'Description:',
        '> Collected the figures.',
        '>',
        '> Sent the PDF.',
        '',
        'Comments:',
        '- 2026-11-14 16:20',
        '  > Client happy',
        '  > with the layout',
        '',
        '## beta',
        '',
        '### Fix login',
        '- Completed: 2026-11-12',
        '- Created: 2026-11-05',
        '- File: tasks/beta/Fix login.md',
        '',
        '## No project',
        '',
        '### Expenses',
        '- Completed: 2026-11-13',
        '- Created: 2026-11-06',
        '- File: tasks/Expenses.md',
        '',
      ].join('\n'),
    );
  });

  it('leaves out an empty prompt and its divider, and counts a single task in words', () => {
    expect(composeAgentPrompt(' ', [admin], ['Done'])).toMatch(/^The 1 task in Done on my mboard board follow/);
  });

  it('says which column each task is in, and since when, once it covers more than one column', () => {
    const waiting = makeTask({
      id: 'tasks/Acme/Quote.md',
      title: 'Quote',
      project: 'Acme',
      status: 'With client',
      created: '2026-11-03T09:00:00',
      history: [{ at: '2026-11-12 11:00', text: 'Moved from In progress to With client' }],
    });
    const prompt = composeAgentPrompt('', [report, waiting], ['Done', 'With client']);

    expect(prompt).toMatch(/^The 2 tasks in With client and Done on my mboard board follow/);
    expect(prompt).toContain(
      ['### Quote', '- Column: With client', '- In With client since: 2026-11-12', '- Created: 2026-11-03'].join('\n'),
    );
    expect(prompt).toContain(['### Monthly report', '- Column: Done', '- Completed: 2026-11-14'].join('\n'));
    expect(prompt.indexOf('### Quote')).toBeLessThan(prompt.indexOf('### Monthly report'));
  });
});
