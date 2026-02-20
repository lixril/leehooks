import { renderHook, act } from "@testing-library/react";
import { useBoolean } from "./useBoolean";
import { describe, expect, it } from "vitest";

describe("useBoolean", () => {
  it("should initialize with default value (false)", () => {
    const { result } = renderHook(() => useBoolean());

    expect(result.current[0]).toBe(false);
  });

  it("should initialize with provided value", () => {
    const { result } = renderHook(() => useBoolean(true));

    expect(result.current[0]).toBe(true);
  });

  it("should set true", () => {
    const { result } = renderHook(() => useBoolean());

    act(() => {
      result.current[1].setTrue();
    });

    expect(result.current[0]).toBe(true);
  });

  it("should toggle value", () => {
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

  it("should reset to initial value", () => {
    const { result } = renderHook(() => useBoolean(true));

    act(() => {
      result.current[1].setFalse();
      result.current[1].reset();
    });

    expect(result.current[0]).toBe(true);
  });
});