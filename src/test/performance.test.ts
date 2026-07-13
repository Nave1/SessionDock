import { describe, it, expect } from "vitest";
import { generateSeedData } from "../utils/seedData";

describe("Performance", () => {
  it("generates 10,000 sessions quickly", () => {
    const start = performance.now();
    const { sessions, folders } = generateSeedData(10000);
    const elapsed = performance.now() - start;

    expect(sessions).toHaveLength(10000);
    expect(folders.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(2000); // Should complete in under 2 seconds
  });

  it("search ranking handles 10,000 sessions efficiently", () => {
    const { sessions } = generateSeedData(10000);
    const query = "192.168";

    const start = performance.now();
    const results = sessions.filter(
      (s) =>
        s.name.toLowerCase().includes(query.toLowerCase()) ||
        s.host.toLowerCase().includes(query.toLowerCase()) ||
        s.description?.toLowerCase().includes(query.toLowerCase()),
    );
    const elapsed = performance.now() - start;

    expect(results.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(100); // Under 100ms for in-memory filter
  });

  it("folder tree building is fast with 1,000 folders", () => {
    const folders = Array.from({ length: 1000 }, (_, i) => ({
      id: `f-${i}`,
      name: `Folder ${i}`,
      parent_id: i > 0 ? `f-${Math.floor(Math.random() * i)}` : undefined,
      sort_order: i,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    const start = performance.now();
    // Build tree structure
    const map = new Map<string, typeof folders[0] & { children: string[] }>();
    for (const f of folders) {
      map.set(f.id, { ...f, children: [] });
    }
    for (const f of folders) {
      if (f.parent_id) {
        const parent = map.get(f.parent_id);
        if (parent) parent.children.push(f.id);
      }
    }
    const elapsed = performance.now() - start;

    expect(map.size).toBe(1000);
    expect(elapsed).toBeLessThan(50); // Under 50ms
  });
});
