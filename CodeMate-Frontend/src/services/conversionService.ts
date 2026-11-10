import type { ConversionResult, Language } from "@/types/domain";
import { apiRequest } from "./client";

export async function convertCode(input: {
  code: string;
  sourceLanguage: Language;
  targetLanguage: Language;
  optimizeWhileConverting: boolean;
}): Promise<ConversionResult> {
  return apiRequest<ConversionResult>("/api/conversion", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
