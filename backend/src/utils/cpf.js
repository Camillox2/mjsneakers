// CPF: 11 dígitos, não repetidos, com os dois dígitos verificadores certos.
function onlyDigits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function isValidCpf(value) {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = (length) => {
    let sum = 0;
    for (let i = 0; i < length; i += 1) sum += Number(cpf[i]) * (length + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

// CNPJ: 14 posições com os dois verificadores. Desde julho de 2026 a Receita
// também emite CNPJ alfanumérico (IN RFB 2.229/2024): as 12 primeiras posições
// aceitam letras e cada caractere vale (código ASCII - 48) no cálculo.
function cleanCnpj(value) {
  return String(value ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
}

function isValidCnpj(value) {
  const cnpj = cleanCnpj(value);
  if (!/^[0-9A-Z]{12}\d{2}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false;
  const valueAt = (i) => cnpj.charCodeAt(i) - 48;
  const digit = (length) => {
    const weights = length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((acc, w, i) => acc + valueAt(i) * w, 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return digit(12) === Number(cnpj[12]) && digit(13) === Number(cnpj[13]);
}

// Para log: só os 3 últimos dígitos.
function maskDocument(value) {
  const digits = onlyDigits(value);
  return digits ? `***${digits.slice(-3)}` : '';
}

module.exports = { onlyDigits, cleanCnpj, isValidCpf, isValidCnpj, maskDocument };
