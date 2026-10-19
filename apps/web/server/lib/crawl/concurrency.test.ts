import { describe, expect, it } from "vitest";
import { mapConcurrent } from "./concurrency.js";

describe("bounded crawl work", () => {
  it("runs independent jobs concurrently without exceeding the limit or reordering results", async () => {
    let active = 0; let peak = 0;
    const result = await mapConcurrent([0, 1, 2, 3, 4, 5], 2, async (value) => {
      active++; peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, value % 2 ? 2 : 1));
      active--; return value * 2;
    });
    expect(result).toEqual([0, 2, 4, 6, 8, 10]); expect(peak).toBe(2); expect(active).toBe(0);
  });
  it("awaits in-flight work before reporting a failed batch", async () => {
    let completed = false;
    await expect(mapConcurrent([0, 1], 2, async (value) => {
      if (value === 0) throw new Error("failed");
      await new Promise((resolve) => setTimeout(resolve, 1)); completed = true;
    })).rejects.toThrow("failed");
    expect(completed).toBe(true);
  });
});
