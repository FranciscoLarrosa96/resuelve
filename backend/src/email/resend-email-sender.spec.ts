import { ResendEmailSender } from './resend-email-sender';

describe('ResendEmailSender', () => {
  const message = { to: 'a@b.com', subject: 'Hola', html: '<p>x</p>', text: 'x', unsubscribeUrl: 'https://u.test/baja' };
  const sender = new ResendEmailSender({ apiKey: 're_test', from: 'Resuelve <no-responder@resuelve.dev>' });
  let fetchMock: jest.SpyInstance;

  afterEach(() => fetchMock.mockRestore());

  it('manda el mensaje a la API con la key y List-Unsubscribe', async () => {
    fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{"id":"1"}', { status: 200 }));
    await sender.send(message);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer re_test');
    const body = JSON.parse(init.body as string);
    expect(body.to).toEqual(['a@b.com']);
    expect(body.headers['List-Unsubscribe']).toBe('<https://u.test/baja>');
  });

  it('tira error si Resend rechaza el envío', async () => {
    fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('domain not verified', { status: 403 }));
    await expect(sender.send(message)).rejects.toThrow('Resend respondió 403');
  });
});
