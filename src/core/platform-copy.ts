export type CopyPlatform = "x" | "linkedin" | "threads";

export interface PlatformCopyVariant {
  platform: CopyPlatform;
  label: string;
  text: string;
  characterCount: number;
  maxCharacters: number;
  warnings: string[];
}

const rules: Record<CopyPlatform, { label: string; maxCharacters: number }> = {
  x: { label: "X", maxCharacters: 280 },
  linkedin: { label: "LinkedIn", maxCharacters: 3000 },
  threads: { label: "Threads", maxCharacters: 500 },
};

export function createPlatformVariants(input: { chinese?: string; english?: string }): PlatformCopyVariant[] {
  const source = input.chinese?.trim() || input.english?.trim();
  if (!source) return [];
  return (Object.keys(rules) as CopyPlatform[]).map((platform) => {
    const rule = rules[platform];
    const text = source;
    const warnings: string[] = [];
    if (source.length > rule.maxCharacters) warnings.push(`超过 ${rule.maxCharacters} 字符，必须重新生成，禁止硬截断。`);
    if (!text.includes("http://") && !text.includes("https://")) warnings.push("未检测到链接，可按需补充来源链接。");
    return { platform, label: rule.label, text, characterCount: text.length, maxCharacters: rule.maxCharacters, warnings };
  });
}
