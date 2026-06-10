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
  (response) => response,
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
