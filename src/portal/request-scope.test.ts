import { expect, it } from "vitest";
import { PortalRequestScope } from "./request-scope";
it("invalidates a delayed response on logout or grant revision even after the transport completed", async () => {
  const scope = new PortalRequestScope(),
    request = scope.capture();
  let finish!: (value: string) => void;
  const response = new Promise<string>((resolve) => {
    finish = resolve;
  });
  const delivered: string[] = [];
  const pending = response.then((value) => {
    if (request.current()) delivered.push(value);
  });
  scope.invalidate();
  finish("private document");
  await pending;
  expect(delivered).toEqual([]);
  expect(request.signal.aborted).toBe(true);
  expect(scope.capture().current()).toBe(true);
});
