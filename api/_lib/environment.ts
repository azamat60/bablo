let runtime: Record<string, unknown> | undefined;
export function configureRuntimeEnvironment(env: Record<string, unknown>) {
  runtime = env;
}
export function serverVariable(name: string): string | undefined {
  const value = runtime?.[name] ?? (typeof process === 'undefined' ? undefined : process.env[name]);
  return typeof value === 'string' ? value : undefined;
}
