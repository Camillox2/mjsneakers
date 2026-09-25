// Parser robusto para o campo `sizes` do produto.
// Aceita tanto JSON (["38","39"]) quanto string separada por vírgula ("38, 39, 40").
export function parseSizes(sizesStr) {
  if (!sizesStr) return []
  if (Array.isArray(sizesStr)) return sizesStr.map(String).map(s => s.trim()).filter(Boolean)
  try {
    const parsed = JSON.parse(sizesStr)
    if (Array.isArray(parsed)) return parsed.map(String).map(s => s.trim()).filter(Boolean)
  } catch {
    /* não é JSON: trata como CSV abaixo */
  }
  return String(sizesStr).split(',').map(s => s.trim()).filter(Boolean)
}
