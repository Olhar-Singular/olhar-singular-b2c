export type ResolvedFileName = { finalName: string; wasRenamed: boolean };

function splitExtension(name: string): { base: string; ext: string } {
  const lastDot = name.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === name.length - 1) return { base: name, ext: "" };
  return { base: name.slice(0, lastDot), ext: name.slice(lastDot) };
}

export function resolveUniqueFileName(
  desiredName: string,
  existingNames: readonly string[],
): ResolvedFileName {
  const taken = new Set(existingNames.map((n) => n.toLowerCase()));
  if (!taken.has(desiredName.toLowerCase())) return { finalName: desiredName, wasRenamed: false };

  const { base, ext } = splitExtension(desiredName);
  for (let i = 1; ; i++) {
    const candidate = `${base} (${i})${ext}`;
    if (!taken.has(candidate.toLowerCase())) return { finalName: candidate, wasRenamed: true };
  }
}
