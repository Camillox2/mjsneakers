import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('mj_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

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
    if (error.response?.status === 401) {
      const isAdminRoute = error.config?.url?.includes('/auth') === false;
      if (isAdminRoute && localStorage.getItem('mj_token')) {
        localStorage.removeItem('mj_token');
        localStorage.removeItem('mj_user');
        window.location.href = '/admin';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
