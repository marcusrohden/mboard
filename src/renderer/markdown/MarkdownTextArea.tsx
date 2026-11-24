import {
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type Ref,
  type TextareaHTMLAttributes,
} from 'react';
import { MarkdownText } from './MarkdownText';
import { afterPointerRelease, isPointerPressed, trackPointerPresses } from './pointer-release';
import styles from './MarkdownTextArea.module.css';

type TextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value'>;

interface MarkdownTextAreaProps extends TextareaProps {
  value: string;
  /** The field's name, which also names the rendered view. */
  label: string;
  /** Points at the element on show: the rendered view or the textarea. */
  ref?: Ref<HTMLElement>;
  /** Classes for the rendered view, beside `className` for the textarea. */
  previewClassName?: string;
}

function attributesForBoth(props: TextareaProps): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(props).filter(([key]) => key.startsWith('data-') || key === 'aria-describedby'),
  );
}

function hasSelectedText(): boolean {
  return !(window.getSelection()?.isCollapsed ?? true);
}

/**
 * A markdown textarea that shows its text rendered (`MarkdownText`) while it isn't being edited, and its
 * markdown source while it is. The text is never changed by the switch. A click on the rendered text, other
 * than on a link or to select text, or Enter or Space while it has focus, opens the source with the caret at the
 * end. Focus alone doesn't, so a dialog can focus the field and still show it rendered.
 *
 * Losing focus switches back, once any pointer press that took the focus is released (`afterPointerRelease`),
 * so the controls below don't move under the pointer mid-click. Losing focus because the window did keeps the
 * source open, so switching apps keeps the caret. An empty field always shows the textarea and its placeholder.
 * A read-only field only ever shows its text rendered, with links still working.
 */
export function MarkdownTextArea({
  value,
  label,
  ref,
  previewClassName,
  readOnly = false,
  onFocus,
  onBlur,
  ...textareaProps
}: MarkdownTextAreaProps) {
  const [isEditing, setIsEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const focusAfterSwitch = useRef<'source' | 'preview' | null>(null);
  const cancelLeave = useRef<() => void>(() => undefined);
  const showsPreview = !isEditing && value.trim() !== '';

  useEffect(trackPointerPresses, []);
  useEffect(() => () => cancelLeave.current(), []);
  useImperativeHandle(ref, () => (showsPreview ? previewRef.current : textareaRef.current) as HTMLElement, [
    showsPreview,
  ]);

  useLayoutEffect(() => {
    const target = focusAfterSwitch.current;
    focusAfterSwitch.current = null;
    if (target === 'preview') previewRef.current?.focus();
    if (target !== 'source') return;
    const textarea = textareaRef.current;
    textarea?.focus();
    textarea?.setSelectionRange(textarea.value.length, textarea.value.length);
  }, [showsPreview]);

  function startEditing(): void {
    if (readOnly) return;
    cancelLeave.current();
    focusAfterSwitch.current = 'source';
    setIsEditing(true);
  }

  function handleFocus(event: FocusEvent<HTMLTextAreaElement>): void {
    cancelLeave.current();
    setIsEditing(true);
    onFocus?.(event);
  }

  function handleBlur(event: FocusEvent<HTMLTextAreaElement>): void {
    onBlur?.(event);
    if (!document.hasFocus()) return;
    const keepsFocus = event.relatedTarget === null && !isPointerPressed();
    cancelLeave.current = afterPointerRelease(() => {
      if (keepsFocus) focusAfterSwitch.current = 'preview';
      setIsEditing(false);
    });
  }

  function handlePreviewClick(event: MouseEvent<HTMLDivElement>): void {
    if (event.defaultPrevented || hasSelectedText()) return;
    startEditing();
  }

  function handlePreviewKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    startEditing();
  }

  if (showsPreview) {
    return (
      <div
        ref={previewRef}
        role="group"
        aria-label={label}
        tabIndex={readOnly ? undefined : 0}
        title={readOnly ? undefined : 'Click to edit'}
        className={[styles.preview, readOnly ? styles.readOnly : styles.editable, previewClassName]
          .filter(Boolean)
          .join(' ')}
        {...attributesForBoth(textareaProps)}
        onClick={handlePreviewClick}
        onKeyDown={handlePreviewKeyDown}
      >
        <MarkdownText text={value} />
      </div>
    );
  }

  return (
    <textarea
      ref={textareaRef}
      value={value}
      readOnly={readOnly}
      {...textareaProps}
      onFocus={handleFocus}
      onBlur={handleBlur}
    />
  );
}
