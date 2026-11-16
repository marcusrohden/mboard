import { useId, type InputHTMLAttributes } from 'react';

interface ProjectInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'list' | 'type'> {
  suggestions: readonly string[];
}

/**
 * A text input for a project name that offers existing projects as suggestions.
 */
export function ProjectInput({ suggestions, ...rest }: ProjectInputProps) {
  const listId = useId();
  return (
    <>
      <input type="text" list={listId} autoComplete="off" {...rest} />
      <datalist id={listId}>
        {suggestions.map((suggestion) => (
          <option key={suggestion} value={suggestion} />
        ))}
      </datalist>
    </>
  );
}
