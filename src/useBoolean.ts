import { useState, useCallback } from 'react';

/**
 * Hook to manage boolean state.
 * @param initialState Initial boolean value (default: false)
 * @returns [value, { setTrue, setFalse, toggle, setValue }]
 */
export function useBoolean(initialState: boolean = false) {
  const [value, setValue] = useState(initialState);

  const setTrue = useCallback(() => setValue(true), []);
  const setFalse = useCallback(() => setValue(false), []);
  const toggle = useCallback(() => setValue((v) => !v), []);

  return [
    value,
    {
      setTrue,
      setFalse,
      toggle,
      setValue,
    },
  ] as const;
}
