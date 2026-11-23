import { describe, expect, it } from 'vitest';
import {
  AgentPromptMessage,
  DEFAULT_AGENT_PROMPT,
  addAgentPrompt,
  addAgentPromptVersion,
  agentPromptProblem,
  latestVersion,
  newAgentPromptName,
  normaliseAgentPromptDraft,
  removeAgentPrompt,
  sanitiseAgentPromptLibrary,
  selectAgentPrompt,
  selectedAgentPrompt,
  startAgentPromptLibrary,
  type AgentPromptLibrary,
} from './agentPrompts';

const MONDAY = new Date(2026, 10, 23, 9, 30, 0);
const TUESDAY = new Date(2026, 10, 24, 14, 5, 7);

function library(): AgentPromptLibrary {
  const started = startAgentPromptLibrary('timesheet', 'List my work.', MONDAY);
  return addAgentPrompt(started, 'standup', { name: 'Standup', text: 'Summarise yesterday.' }, MONDAY);
}

function names(prompts: AgentPromptLibrary): string[] {
  return prompts.prompts.map((prompt) => latestVersion(prompt).name);
}

describe('startAgentPromptLibrary', () => {
  it('starts with one selected prompt, holding the prompt Settings kept, as version 1', () => {
    expect(startAgentPromptLibrary('first', '  List my work.\r\n', MONDAY)).toEqual({
      prompts: [
        {
          id: 'first',
          versions: [{ number: 1, name: 'Default prompt', text: 'List my work.', savedAt: '2026-11-23T09:30:00' }],
        },
      ],
      selectedId: 'first',
    });
  });

  it('keeps an empty prompt, and falls back to the default prompt for one too long to save', () => {
    expect(latestVersion(startAgentPromptLibrary('a', '', MONDAY).prompts[0]!).text).toBe('');
    expect(latestVersion(startAgentPromptLibrary('a', 'x'.repeat(20_001), MONDAY).prompts[0]!).text).toBe(
      DEFAULT_AGENT_PROMPT,
    );
  });
});

describe('agentPromptProblem', () => {
  it.each<[string, { name: string; text: string }, string | null, RegExp]>([
    ['an empty name', { name: '   ', text: 'Hi' }, null, /Give the prompt a name/],
    ['a very long name', { name: 'n'.repeat(81), text: 'Hi' }, null, /at most 80 characters/],
    ['a very long prompt', { name: 'Big', text: 'x'.repeat(20_001) }, null, /at most 20,000 characters/],
    [
      'a name another prompt has, ignoring case',
      { name: ' standup ', text: '' },
      null,
      /already a prompt called “Standup”/,
    ],
    ['a rename to another prompt’s name', { name: 'STANDUP', text: '' }, 'timesheet', /already a prompt called/],
  ])('rejects %s in plain words', (_case, draft, id, message) => {
    expect(agentPromptProblem(draft, library(), id)).toMatch(message);
  });

  it('accepts an empty prompt, and a prompt keeping its own name in another case', () => {
    expect(agentPromptProblem({ name: 'Weekly', text: '' }, library(), null)).toBeNull();
    expect(agentPromptProblem({ name: 'STANDUP', text: 'Hi' }, library(), 'standup')).toBeNull();
  });

  it('collapses the name to one line and trims the text to \\n line breaks', () => {
    expect(normaliseAgentPromptDraft({ name: ' Weekly \n report ', text: '\r\nOne\r\nTwo\n ' })).toEqual({
      name: 'Weekly report',
      text: 'One\nTwo',
    });
  });
});

describe('addAgentPrompt', () => {
  it('adds the prompt as version 1, keeps prompts in name order and selects the new one', () => {
    const added = addAgentPrompt(library(), 'weekly', { name: 'Ask for a report', text: ' Report ' }, TUESDAY);
    expect(names(added)).toEqual(['Ask for a report', 'Default prompt', 'Standup']);
    expect(added.selectedId).toBe('weekly');
    expect(added.prompts[0]?.versions).toEqual([
      { number: 1, name: 'Ask for a report', text: 'Report', savedAt: '2026-11-24T14:05:07' },
    ]);
  });

  it('refuses a draft that cannot be saved', () => {
    expect(() => addAgentPrompt(library(), 'again', { name: 'Standup', text: '' }, TUESDAY)).toThrow(/already/);
  });
});

describe('addAgentPromptVersion', () => {
  it('adds every save as the next version, keeping the earlier ones', () => {
    const once = addAgentPromptVersion(
      library(),
      'timesheet',
      { name: 'Default prompt', text: 'List it all.' },
      TUESDAY,
    );
    const twice = addAgentPromptVersion(once, 'timesheet', { name: 'Timesheet', text: 'List it all.' }, TUESDAY);
    const prompt = twice.prompts.find((candidate) => candidate.id === 'timesheet');
    expect(prompt?.versions.map(({ number, name, text }) => ({ number, name, text }))).toEqual([
      { number: 1, name: 'Default prompt', text: 'List my work.' },
      { number: 2, name: 'Default prompt', text: 'List it all.' },
      { number: 3, name: 'Timesheet', text: 'List it all.' },
    ]);
    expect(names(twice)).toEqual(['Standup', 'Timesheet']);
    expect(twice.selectedId).toBe('timesheet');
  });

  it('adds nothing when the draft matches the latest version once trimmed', () => {
    const before = library();
    const after = addAgentPromptVersion(
      before,
      'standup',
      { name: ' Standup', text: 'Summarise yesterday.\n' },
      TUESDAY,
    );
    expect(after.prompts).toEqual(before.prompts);
    expect(after.selectedId).toBe('standup');
  });

  it('saves an earlier version again as a new version, so restoring never loses anything', () => {
    const edited = addAgentPromptVersion(library(), 'standup', { name: 'Standup', text: 'Changed.' }, TUESDAY);
    const restored = addAgentPromptVersion(
      edited,
      'standup',
      { name: 'Standup', text: 'Summarise yesterday.' },
      TUESDAY,
    );
    const prompt = restored.prompts.find((candidate) => candidate.id === 'standup');
    expect(prompt?.versions.map((version) => version.text)).toEqual([
      'Summarise yesterday.',
      'Changed.',
      'Summarise yesterday.',
    ]);
  });

  it('refuses a prompt that is gone', () => {
    expect(() => addAgentPromptVersion(library(), 'gone', { name: 'X', text: '' }, TUESDAY)).toThrow(
      AgentPromptMessage.missing,
    );
  });
});

describe('removeAgentPrompt', () => {
  it('selects the prompt after the deleted one, or the one before when it was last', () => {
    const three = addAgentPrompt(library(), 'weekly', { name: 'Weekly', text: '' }, TUESDAY);
    const selectedMiddle = selectAgentPrompt(three, 'standup');
    expect(removeAgentPrompt(selectedMiddle, 'standup').selectedId).toBe('weekly');
    expect(removeAgentPrompt(three, 'weekly').selectedId).toBe('standup');
  });

  it('keeps the selection when another prompt is deleted', () => {
    const selected = selectAgentPrompt(library(), 'timesheet');
    expect(removeAgentPrompt(selected, 'standup')).toEqual({
      prompts: [selected.prompts[0]],
      selectedId: 'timesheet',
    });
  });

  it('refuses to delete the last prompt, or one that is gone', () => {
    const one = startAgentPromptLibrary('only', 'Hi', MONDAY);
    expect(() => removeAgentPrompt(one, 'only')).toThrow(AgentPromptMessage.lastPrompt);
    expect(() => removeAgentPrompt(library(), 'gone')).toThrow(AgentPromptMessage.missing);
  });
});

describe('newAgentPromptName', () => {
  it('numbers the name when New prompt is taken', () => {
    expect(newAgentPromptName(library())).toBe('New prompt');
    const taken = addAgentPrompt(library(), 'new', { name: 'new PROMPT', text: '' }, TUESDAY);
    const takenTwice = addAgentPrompt(taken, 'new2', { name: 'New prompt 2', text: '' }, TUESDAY);
    expect(newAgentPromptName(takenTwice)).toBe('New prompt 3');
  });
});

describe('sanitiseAgentPromptLibrary', () => {
  it('reads back a saved library as it was', () => {
    const saved = library();
    expect(sanitiseAgentPromptLibrary(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
  });

  it('drops what it cannot read, keeping every prompt with a readable version', () => {
    const raw = {
      selectedId: 'missing',
      prompts: [
        { id: 'b', versions: [{ number: 1, name: 'Beta', text: 'B', savedAt: '2026-11-23T09:30:00' }] },
        {
          id: 'a',
          versions: [
            { number: 2, name: 'Alpha', text: 'A2', savedAt: '2026-11-23 10:00' },
            { number: 1, name: 'Alpha', text: 'A1', savedAt: '2026-11-23T09:00:00' },
            { number: 1, name: 'Alpha', text: 'duplicate number', savedAt: '2026-11-23T09:00:00' },
            { number: 3, name: '', text: 'no name', savedAt: '2026-11-23T11:00:00' },
            { number: 4, name: 'Alpha', text: 'bad date', savedAt: 'yesterday' },
          ],
        },
        { id: 'b', versions: [{ number: 1, name: 'Duplicate id', text: '', savedAt: '2026-11-23T09:30:00' }] },
        { id: 'has spaces', versions: [{ number: 1, name: 'Bad id', text: '', savedAt: '2026-11-23T09:30:00' }] },
        { id: 'c', versions: [] },
        'not a prompt',
      ],
    };
    const sanitised = sanitiseAgentPromptLibrary(raw);
    expect(sanitised?.selectedId).toBe('a');
    expect(sanitised?.prompts.map((prompt) => [prompt.id, prompt.versions.map((version) => version.text)])).toEqual([
      ['a', ['A1', 'A2']],
      ['b', ['B']],
    ]);
    expect(sanitised?.prompts[0]?.versions[1]?.savedAt).toBe('2026-11-23T10:00:00');
  });

  it.each([null, [], 'text', {}, { prompts: [] }, { prompts: [{ id: 'a', versions: 'none' }] }])(
    'has no library when the file holds %j',
    (raw) => {
      expect(sanitiseAgentPromptLibrary(raw)).toBeNull();
    },
  );

  it('falls back to the first prompt when nothing is selected', () => {
    const { selectedId: _ignored, ...withoutSelection } = library();
    expect(selectedAgentPrompt({ ...withoutSelection, selectedId: 'gone' })?.id).toBe('timesheet');
    expect(sanitiseAgentPromptLibrary(withoutSelection)?.selectedId).toBe('timesheet');
  });
});
