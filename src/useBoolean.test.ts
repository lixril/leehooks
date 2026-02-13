import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useBoolean } from './useBoolean';

describe('useBoolean', () => {
  it('should initialize with default value', () => {
    const { result } = renderHook(() => useBoolean());
    expect(result.current[0]).toBe(false);
  });

  it('should initialize with provided value', () => {
    const { result } = renderHook(() => useBoolean(true));
    expect(result.current[0]).toBe(true);
  });

  it('should set true', () => {
    const { result } = renderHook(() => useBoolean(false));
    act(() => {
      result.current[1].setTrue();
    });
    expect(result.current[0]).toBe(true);
  });

  it('should set false', () => {
    const { result } = renderHook(() => useBoolean(true));
    act(() => {
      result.current[1].setFalse();
    });
    expect(result.current[0]).toBe(false);
  });

  it('should toggle', () => {
    const { result } = renderHook(() => useBoolean(false));
    act(() => {
      result.current[1].toggle();
    });
    expect(result.current[0]).toBe(true);
    act(() => {
      result.current[1].toggle();
    });
    expect(result.current[0]).toBe(false);
  });
});
