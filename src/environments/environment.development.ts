/** `ng serve`: backend local (Docker Compose o backend iniciado en el host). */
export const environment = {
  publicAppUrl: '', // Optional canonical origin; defaults to the browser / SSR request origin.
  production: false,
  apiUrl: 'http://localhost:3000/api/v1',
};
