// Ajudantes de formulário das telas de catálogo, vitrine e frete.

// Número digitado do jeito brasileiro: "1.299,90", "1299,90" e "1299.90"
// valem 1299,9. Vazio ou com letra vira NaN (parseFloat aceitaria "12abc").
export function parseDecimal(value) {
  let text = String(value ?? '').replace(/[R$%\s]/g, '')
  if (!text) return NaN
  if (text.includes(',')) text = text.replace(/\./g, '').replace(',', '.')
  else if (/^\d{1,3}(\.\d{3})+$/.test(text)) text = text.replace(/\./g, '')
  return Number(text)
}

// Valor do banco (1299.90) no formato do campo (1299,90).
export const decimalInput = (value) => (value === null || value === undefined || value === '' ? '' : String(value).replace('.', ','))

// Link que a loja aceita num botão ou banner: página da loja (/), âncora (#)
// ou endereço http(s). Nada de javascript: ou coisa parecida.
export const validLink = (value) => {
  const text = String(value || '').trim()
  return !text || text.startsWith('/') || text.startsWith('#') || /^https?:\/\/[^\s]+$/i.test(text)
}

// Os mesmos formatos e o mesmo limite do upload no servidor: o aviso sai
// antes de enviar, com o nome do arquivo, em vez do erro do servidor.
export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/avif'
const IMAGE_TYPES = IMAGE_ACCEPT.split(',')
const IMAGE_MAX_MB = 10

// Devolve o problema da imagem, ou '' quando ela serve.
export function imageProblem(file) {
  if (!file) return 'Nenhuma imagem escolhida.'
  if (!IMAGE_TYPES.includes(file.type)) return `"${file.name}" não é um formato aceito. Use JPG, PNG, WebP ou GIF.`
  if (file.size > IMAGE_MAX_MB * 1024 * 1024) return `"${file.name}" passa de ${IMAGE_MAX_MB} MB. Use uma imagem menor.`
  return ''
}
