import { memberSinceText, responseText } from './professional-facts';

describe('trayectoria visible para el cliente', () => {
  it('"Suele responder en…": solo con dato real, en una escala que se entiende', () => {
    expect(responseText(null)).toBeNull();
    expect(responseText(undefined)).toBeNull();
    expect(responseText(0)).toBe('Suele responder en menos de 1 h');
    expect(responseText(59)).toBe('Suele responder en menos de 1 h');
    expect(responseText(150)).toBe('Suele responder en unas 3 h');
    expect(responseText(26 * 60)).toBe('Suele responder en 1 día');
    expect(responseText(3 * 24 * 60)).toBe('Suele responder en 3 días');
  });

  it('"En Resuelve desde": mes y año de Argentina', () => {
    expect(memberSinceText('2026-03-01T02:00:00.000Z')).toBe('En Resuelve desde febrero de 2026');
    expect(memberSinceText(null)).toBeNull();
    expect(memberSinceText('no-fecha')).toBeNull();
  });
});
