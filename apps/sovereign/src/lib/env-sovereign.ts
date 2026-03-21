/**
 * Prefer SOVEREIGN_* env names; fall back to legacy SENTINELSQUAD_* where both are supported.
 */
export function sovereignEnv(primary: string, legacy: string): string | undefined {
  const a = process.env[primary];
  if (a !== undefined && a !== "") return a;
  const b = process.env[legacy];
  if (b !== undefined && b !== "") return b;
  return undefined;
}

export function sovereignEnvDefault(primary: string, legacy: string, fallback: string): string {
  return sovereignEnv(primary, legacy) ?? fallback;
}
