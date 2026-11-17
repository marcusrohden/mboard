import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useDomEnvironment } from '../testing/dom-environment';
import { useEditableValue } from './use-editable-value';

useDomEnvironment();

function renderEditable(save: (next: string) => Promise<boolean>) {
  return renderHook(() => useEditableValue('Acme', save)).result;
}

describe('useEditableValue', () => {
  it('saves nothing when the draft is discarded before the commit that follows', async () => {
    const save = vi.fn(async () => true);
    const editable = renderEditable(save);
    act(() => editable.current.begin());
    act(() => editable.current.change('Acme Corp'));
    act(() => editable.current.discard());
    await act(() => editable.current.commit());
    expect(save).not.toHaveBeenCalled();
    expect(editable.current.displayed).toBe('Acme');
  });

  it('still saves a later edit when a discard found no draft', async () => {
    const save = vi.fn(async () => true);
    const editable = renderEditable(save);
    act(() => editable.current.discard());
    act(() => editable.current.begin());
    act(() => editable.current.change('Acme Corp'));
    await act(() => editable.current.commit());
    expect(save).toHaveBeenCalledWith('Acme Corp');
  });
});
