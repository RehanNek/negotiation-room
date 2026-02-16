declare namespace Express {
  interface Request {
    authWallet?: string;
    authSessionMode?: 'signature' | 'demo';
  }
}
