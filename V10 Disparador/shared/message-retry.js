/**
 * Retry helper for messages sent to a browser content script.
 * It does not depend on chrome.tabs status: a live SPA can stay in a
 * transient "loading" state while still accepting extension messages.
 */
export async function sendWithRetry(operation, options = {}) {
  const delays = Array.isArray(options.delays) && options.delays.length
    ? options.delays
    : [0, 250, 500, 900];
  const wait = typeof options.wait === 'function'
    ? options.wait
    : ms => new Promise(resolve => setTimeout(resolve, ms));
  let lastError = null;

  for (let index = 0; index < delays.length; index += 1) {
    const delay = Math.max(0, Number(delays[index]) || 0);
    if (delay > 0) await wait(delay);

    try {
      const response = await operation(index + 1);
      if (response !== null && response !== undefined) return response;
      lastError = new Error('No response from the content script.');
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }

    if (typeof options.onFailure === 'function') {
      try {
        await options.onFailure(lastError, index + 1);
      } catch (hookError) {
        if (!lastError.cause) lastError.cause = hookError;
      }
    }

    if (typeof options.onRetry === 'function') {
      options.onRetry({ attempt: index + 1, error: lastError });
    }
  }

  const failure = new Error(options.errorMessage || 'Content script did not respond after retries.');
  if (lastError) failure.cause = lastError;
  throw failure;
}
