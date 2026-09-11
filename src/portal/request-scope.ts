/** A logout or known grant change invalidates delayed responses as well as visible queries. */
export class PortalRequestScope {
  private revision = 0;
  private controller = new AbortController();
  capture() {
    const revision = this.revision;
    return {
      signal: this.controller.signal,
      current: () =>
        !this.controller.signal.aborted && this.revision === revision,
    };
  }
  invalidate() {
    this.controller.abort();
    this.revision++;
    this.controller = new AbortController();
  }
}
export const portalRequestScope = new PortalRequestScope();
export function combinedPortalSignal(primary?: AbortSignal) {
  const scope = portalRequestScope.capture();
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (scope.signal.aborted || primary?.aborted) abort();
  else {
    scope.signal.addEventListener("abort", abort, { once: true });
    primary?.addEventListener("abort", abort, { once: true });
  }
  return {
    signal: controller.signal,
    current: scope.current,
    cleanup: () => {
      scope.signal.removeEventListener("abort", abort);
      primary?.removeEventListener("abort", abort);
    },
  };
}
