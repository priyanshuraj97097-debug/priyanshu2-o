import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

import { GATEWAY_BASE_URL, getGatewayKey } from "./config.server";

/** AI SDK provider bound to the server-side gateway credentials. */
export function createProvider() {
  const key = getGatewayKey();
  return createOpenAICompatible({
    name: "priyanshu-gateway",
    baseURL: GATEWAY_BASE_URL,
    headers: {
      "Lovable-API-Key": key,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
  });
}