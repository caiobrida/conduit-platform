import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { EvolutionClient, normalizePhone } from './evolution.client';

const config = (vals: Record<string, string | undefined>) =>
  ({ get: (k: string) => vals[k] }) as unknown as ConfigService;

describe('normalizePhone', () => {
  it('keeps a number already in country-code form', () => {
    expect(normalizePhone('5519999990000')).toBe('5519999990000');
  });

  it('prefixes Brazil DDI for a local mobile/landline and strips formatting', () => {
    expect(normalizePhone('(19) 99999-0000')).toBe('5519999990000');
    expect(normalizePhone('1933334444')).toBe('551933334444');
  });
});

describe('EvolutionClient', () => {
  const post = jest.fn();

  beforeEach(() => {
    jest.restoreAllMocks();
    post.mockReset();
    jest
      .spyOn(axios, 'create')
      .mockReturnValue({ post } as unknown as ReturnType<typeof axios.create>);
  });

  const configured = () =>
    new EvolutionClient(
      config({
        EVOLUTION_API_URL: 'http://evolution:8080',
        EVOLUTION_API_KEY: 'secret',
        EVOLUTION_INSTANCE: 'caiotest',
      }),
    );

  it('posts to the instance sendText endpoint with the normalized number', async () => {
    post.mockResolvedValue({ data: { key: { id: 'WAMID.123' } } });

    const result = await configured().sendText('(19) 99999-0000', 'hello');

    expect(post).toHaveBeenCalledWith('/message/sendText/caiotest', {
      number: '5519999990000',
      text: 'hello',
    });
    expect(result.messageId).toBe('WAMID.123');
  });

  it('is disabled and throws when not configured', async () => {
    const client = new EvolutionClient(config({}));
    expect(client.isEnabled).toBe(false);
    await expect(client.sendText('5519999990000', 'x')).rejects.toThrow(
      /not configured/,
    );
  });

  it('propagates HTTP errors so the consumer can retry', async () => {
    post.mockRejectedValue(new Error('Request failed with status code 503'));
    await expect(configured().sendText('5519999990000', 'x')).rejects.toThrow(
      '503',
    );
  });
});
