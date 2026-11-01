export function reportMemoKey(
  role: string,
  hrSource: 'hr' | 'pc',
  url: string,
): string {
  return `${role}|${hrSource}|${url}`;
}
