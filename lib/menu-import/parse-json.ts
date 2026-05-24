/** Model bazen ```json ... ``` ile döner */
export function parseJsonFromModelContent(raw: string): unknown {
  let s = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(s);
  if (fence) s = fence[1].trim();
  return JSON.parse(s) as unknown;
}
