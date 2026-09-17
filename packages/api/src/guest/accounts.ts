import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { localAccountSchema } from 'librechat-data-provider';
import type { LocalAccountInput } from 'librechat-data-provider';
import { PreviewStore } from '../../../data-schemas/preview-dist/store.cjs';

const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
const derive = (password: string, salt: string): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      64,
      { N: 131072, r: 8, p: 1, maxmem: 160 * 1024 * 1024 },
      (error, hash) => {
        if (error) reject(error);
        else resolve(hash);
      },
    );
  });

export class LocalAccounts {
  private active = 0;
  private attempts = 0;
  private window = 0;
  constructor(
    readonly store: PreviewStore,
    private readonly now = Date.now,
  ) {}

  user(token?: string): string | undefined {
    return token ? this.store.session(tokenHash(token), this.now()) : undefined;
  }

  logout(token?: string): void {
    if (token) this.store.revoke(tokenHash(token));
  }

  async authenticate(
    action: 'login' | 'register',
    input: LocalAccountInput,
    initialData: string,
  ): Promise<
    | { status: 'ok'; token: string; username: string }
    | { status: 'invalid_credentials' | 'rate_limited' }
  > {
    const parsed = localAccountSchema.safeParse(input);
    if (!parsed.success) return { status: 'invalid_credentials' };
    if (this.now() - this.window >= 60_000) {
      this.attempts = 0;
      this.window = this.now();
    }
    if (this.active >= 2 || this.attempts >= 20) return { status: 'rate_limited' };
    this.attempts++;
    this.active++;
    try {
      const { username, password } = parsed.data;
      const account = this.store.account(username);
      const salt = account?.salt ?? randomBytes(16).toString('hex');
      const hash = await derive(password, salt);
      if (action === 'register') {
        if (account) return { status: 'invalid_credentials' };
        this.store.create({ username, salt, hash: hash.toString('hex'), data: initialData });
      } else if (!account || !timingSafeEqual(Buffer.from(account.hash, 'hex'), hash)) {
        return { status: 'invalid_credentials' };
      }
      const token = randomBytes(32).toString('hex');
      this.store.issue(tokenHash(token), username, this.now() + 86_400_000);
      return { status: 'ok', token, username };
    } catch {
      return { status: 'invalid_credentials' };
    } finally {
      this.active--;
    }
  }
}
