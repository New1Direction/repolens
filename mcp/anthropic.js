// Back-compat shim: older docs/tests imported callAnthropic directly. The MCP
// server now supports Anthropic, OpenAI, OpenRouter, and Google via model.js.
export { callModel as callAnthropic } from './model.js';
