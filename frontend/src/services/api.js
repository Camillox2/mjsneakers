import axios from 'axios';
import { csrfToken, loadSecurityConfig, readCookie } from './security';

// Login por cookie: a sessão do admin (pz_adm) e a do cliente (pz_cli) vivem
// em cookies httpOnly que o JavaScript não lê. O navegador manda os cookies
// sozinho (withCredentials). Contra CSRF, toda chamada que muda dado leva o
// valor do cookie legível pz_csrf no header X-CSRF-Token (sem o cookie
// visível, vale o token de reserva do GET /security/config).

const UNSAFE = new Set(['post', 'put', 'patch', 'delete']);

export { readCookie };

// Põe o X-CSRF-Token nos métodos que mudam dados. Usado aqui e no cliente de
// pagamentos (lib/payments.js).
export async function withCsrf(config) {
  if (UNSAFE.has(String(config.method || 'get').toLowerCase())) {
    let token = csrfToken();
    if (!token) {
      // primeira escrita da visita sem cookie à vista: busca o de reserva
      await loadSecurityConfig();
      token = csrfToken();
    }
    if (token) config.headers['X-CSRF-Token'] = token;
  }
  return config;
}

// Header do captcha (Turnstile) para uma chamada: sem token, nada.
export const captchaHeaders = (token) => (token ? { headers: { 'X-Turnstile-Token': token } } : {});

// Erro 403 do captcha: a chamada pode ser repetida com um token novo.
export const isCaptchaError = (err) => err?.response?.status === 403 && err.response?.data?.code === 'captcha';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true,
});

api.interceptors.request.use(withCsrf);

api.interceptors.response.use(
  (response) => {
    // Sem backend no ar, o servidor da página devolve o index.html (200) no
    // lugar do JSON. Tratar como falha evita que um HTML vire "lista de produtos".
    const type = String(response.headers?.['content-type'] || '')
    if (type.includes('text/html')) {
      const err = new Error('API indisponível')
      err.config = response.config
      err.unavailable = true
      return Promise.reject(err)
    }
    return response
  },
  (error) => {
    // Sessão vencida: quem cuida é a tela que fez a chamada (o admin volta
    // para o login dele, a conta do cliente volta para o código). O aviso
    // vai por evento, para ninguém ser jogado para outra página no meio.
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('pz:unauthorized', { detail: { url: error.config?.url || '' } }));
    }
    return Promise.reject(error);
  }
);

export default api;
