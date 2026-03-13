import { renderHook, act } from "@testing-library/react";
import { useLocalStorage } from "./useLocalStorage";
import { describe, expect, it, beforeEach } from "vitest";

describe("useLocalStorage", () => {

  it("should initialize with given initial value", () => {
    const { result } = renderHook(() =>
      useLocalStorage("initial", "final")
    );

    expect(result.current[0]).toBe("final");
  });

  it("should update value correctly", () => {
    const { result } = renderHook(() =>
      useLocalStorage("initial", "final")
    );

    act(() => {
      result.current[1]("updated");
    });

    expect(result.current[0]).toBe("updated");
    expect(localStorage.getItem("initial")).toBe(
      JSON.stringify("updated")
    );
  });

  it("should remove value correctly", () => {
    const { result } = renderHook(() =>
      useLocalStorage("initial", "final")
    );

    act(() => {
      result.current[2]();
    });

    expect(result.current[0]).toBe("final");
  });

});