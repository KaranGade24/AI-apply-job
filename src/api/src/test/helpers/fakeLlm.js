/**
 * Fake LLM helper for testing Gemini calls without real API keys or network.
 */
let fakeResponseHandler = null;

export const setFakeLlmResponse = (handler) => {
  fakeResponseHandler = handler;
};

export const clearFakeLlm = () => {
  fakeResponseHandler = null;
};

export const getFakeLlmResponse = async (prompt, options) => {
  if (fakeResponseHandler) {
    return await fakeResponseHandler(prompt, options);
  }
  return JSON.stringify({ decision: 'ACT', targetElementId: 'el_1', intent: 'fill_email' });
};

export default {
  setFakeLlmResponse,
  clearFakeLlm,
  getFakeLlmResponse,
};
