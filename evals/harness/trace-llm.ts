/** Eval-only trace of synthetic golden-set request bodies and responses.
 * Never records SDK request options (which may contain authentication headers).
 * Taking a trace resets it between cases; the original client still makes one
 * request, with its original options and error behavior. No retries or replay. */
export function traceLlm(client: { messages: unknown }) {
  const messages = client.messages as { create: (...args: unknown[]) => Promise<unknown> };
  const create = messages.create;
  let trace: { request: unknown; response?: unknown; error?: string }[] = [];
  messages.create = async function (...args: unknown[]) {
    const entry: (typeof trace)[number] = { request: structuredClone(args[0]) };
    trace.push(entry);
    try {
      const response = await create.apply(this, args);
      entry.response = structuredClone(response);
      return response;
    } catch (error) {
      // Error messages can include headers/URLs; record the type only.
      entry.error = error instanceof Error ? error.name : "UnknownError";
      throw error;
    }
  };
  return () => {
    const result = trace;
    trace = [];
    return result;
  };
}
