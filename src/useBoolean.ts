import { useState, useRef, useCallback, useMemo, useEffect } from "react";

type UseBooleanOptions = {
  onChange?: (value: boolean) => void;
  value?: boolean;
};

type UseBooleanActions = {
  setTrue: () => void;
  setFalse: () => void;
  toggle: () => void;
  set: (value: boolean) => void;
  reset: () => void;
};

export function useBoolean(
  initialState: boolean = false,
  options?: UseBooleanOptions
) {
  const { value: controlledValue, onChange } = options ?? {};

  const isControlled = controlledValue !== undefined;

  const [internalValue, setInternalValue] = useState(initialState);
  const initialRef = useRef(initialState);

  const value = isControlled ? controlledValue : internalValue;

  const emitChange = useCallback(
    (next: boolean) => {
      if (!isControlled) setInternalValue(next);
      onChange?.(next);
    },
    [isControlled, onChange]
  );

  const setTrue = useCallback(() => emitChange(true), [emitChange]);
  const setFalse = useCallback(() => emitChange(false), [emitChange]);

  const toggle = useCallback(() => {
    emitChange(!value);
  }, [emitChange, value]);

  const set = useCallback(
    (next: boolean) => emitChange(next),
    [emitChange]
  );

  const reset = useCallback(() => {
    emitChange(initialRef.current);
  }, [emitChange]);

  // Keep internal state synced if switching from controlled → uncontrolled
  useEffect(() => {
    if (isControlled) return;
    setInternalValue(internalValue);
  }, [isControlled, internalValue]);

  const actions: UseBooleanActions = useMemo(
    () => ({
      setTrue,
      setFalse,
      toggle,
      set,
      reset,
    }),
    [setTrue, setFalse, toggle, set, reset]
  );

  return [value, actions] as const;
}