import type { ConversionResult, Language } from "@/types/domain";
import { api } from "./client";

export async function convertCode(input: {
  code: string;
  sourceLanguage: Language;
  targetLanguage: Language;
  optimizeWhileConverting: boolean;
}): Promise<ConversionResult> {
  return api<ConversionResult>("/api/conversion", { body: input });
}
