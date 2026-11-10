import type { Analysis, Language } from "@/types/domain";
import { api } from "./client";

export const SAMPLE_CODE: Record<Language, string> = {
  python: `def max_subarray_sum(nums, k):
    result = 0
    for i in range(len(nums)):
        current = 0
        for j in range(i, min(i + k, len(nums))):
            current += nums[j]
        if current > result:
            result = current
    return result`,
  java: `int maxSubarraySum(int[] nums, int k) {
    int result = 0;
    for (int i = 0; i < nums.length; i++) {
        int current = 0;
        for (int j = i; j < Math.min(i + k, nums.length); j++) {
            current += nums[j];
        }
        result = Math.max(result, current);
    }
    return result;
}`,
  c: `int max_subarray_sum(int *nums, int n, int k) {
    int result = 0;
    for (int i = 0; i < n; i++) {
        int current = 0;
        for (int j = i; j < i + k && j < n; j++) current += nums[j];
        if (current > result) result = current;
    }
    return result;
}`,
  cpp: `int maxSubarraySum(vector<int>& nums, int k) {
    int result = 0;
    for (int i = 0; i < nums.size(); i++) {
        int current = 0;
        for (int j = i; j < min(i + k, (int)nums.size()); j++) current += nums[j];
        result = max(result, current);
    }
    return result;
}`,
  javascript: `function maxSubarraySum(nums, k) {
  let result = 0;
  for (let i = 0; i < nums.length; i++) {
    let current = 0;
    for (let j = i; j < Math.min(i + k, nums.length); j++) current += nums[j];
    result = Math.max(result, current);
  }
  return result;
}`,
  typescript: `function maxSubarraySum(nums: number[], k: number): number {
  let result = 0;
  for (let i = 0; i < nums.length; i++) {
    let current = 0;
    for (let j = i; j < Math.min(i + k, nums.length); j++) current += nums[j];
    result = Math.max(result, current);
  }
  return result;
}`,
};

export function detectLanguage(code: string): Language {
  if (/\bdef\s+\w+\(|\bself\b|:\s*$/m.test(code)) return "python";
  if (/\bpublic\s+(class|static)\b|System\.out/.test(code)) return "java";
  if (/#include\s*<iostream>|std::|vector</.test(code)) return "cpp";
  if (/#include\s*<stdio\.h>|printf\(/.test(code)) return "c";
  if (/:\s*(number|string|boolean)\b|interface\s+\w+/.test(code)) return "typescript";
  return "javascript";
}

export async function analyzeCode(input: { code: string; language: Language }): Promise<Analysis> {
  return api<Analysis>("/api/analysis", { body: input });
}
