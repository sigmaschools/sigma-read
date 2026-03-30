export function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (key in vars) return String(vars[key]);
    throw new Error(`Missing template variable: {{${key}}}`);
  });
}
