import { publicFrontendUrl } from './frontend-url';

describe('publicFrontendUrl', () => {
  it('usa el primer origen de la lista de CORS', () => {
    expect(publicFrontendUrl('https://resuelve.com.ar,https://resuelve-pearl.vercel.app')).toBe(
      'https://resuelve.com.ar',
    );
    expect(publicFrontendUrl(' https://resuelve.com.ar/ , https://otro.example')).toBe('https://resuelve.com.ar');
  });

  it('sin valor cae en el front local', () => {
    expect(publicFrontendUrl(undefined)).toBe('http://localhost:4200');
    expect(publicFrontendUrl(' , ')).toBe('http://localhost:4200');
  });
});
