import { createOpenAICompatible } from "npm:@ai-sdk/openai-compatible@^3";

// Minimal Lovable AI Gateway provider for Supabase Edge Functions.
export function createLovableAiGatewayProvider(lovableApiKey: string, options?: { structuredOutputs?: boolean }) {
  return createOpenAICompatible({
    name: "lovable",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    supportsStructuredOutputs: options?.structuredOutputs ?? false,
    headers: {
      "Lovable-API-Key": lovableApiKey,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
  });
}