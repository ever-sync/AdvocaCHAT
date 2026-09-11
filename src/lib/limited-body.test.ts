import { describe, it, expect } from "vitest";
import { limitedBody } from "../../supabase/functions/_shared/limited-body";
describe("streamed upload limits", () => {
  it("rejects actual bytes beyond the limit without trusting declared length", async () => {
    let cancelled = false;
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(9)); }, cancel() { cancelled = true; } });
    const request = new Request("https://example.invalid", { method: "POST", headers: { "Content-Length": "1" }, body: stream, duplex: "half" } as RequestInit);
    expect(await limitedBody(request, 8)).toBeNull(); expect(cancelled).toBe(true);
  });
  it("preserves bounded bytes across streamed chunks", async () => {
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1, 2])); controller.enqueue(new Uint8Array([3])); controller.close(); } });
    const request = new Request("https://example.invalid", { method: "POST", body: stream, duplex: "half" } as RequestInit);
    expect(await limitedBody(request, 3)).toEqual(new Uint8Array([1, 2, 3]));
  });
});
