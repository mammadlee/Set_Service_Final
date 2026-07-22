import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  request_id: string;
  correlation_id: string;
  release_sha?: string;
  actor_id?: string;
  role?: string;
  tenant_id?: string;
}

const requestContextStorage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(context: RequestContext, callback: () => T): T {
  return requestContextStorage.run(context, callback);
}

export function getRequestContext(): RequestContext | undefined {
  return requestContextStorage.getStore();
}

export function updateRequestContext(fields: Partial<RequestContext>): void {
  const context = requestContextStorage.getStore();
  if (context) Object.assign(context, fields);
}
