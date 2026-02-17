'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { formatWallet } from '@/lib/formatters';

interface WalletConnectProps {
  onConnect: (address: string) => void;
  address: string | null;
  compact?: boolean;
}

async function signMessage(addressToSign: string, message: string): Promise<string> {
  if (!window.ethereum) throw new Error('MetaMask not found');

  try {
    return await window.ethereum.request<string>({
      method: 'personal_sign',
      params: [message, addressToSign],
    });
  } catch {
    return await window.ethereum.request<string>({
      method: 'personal_sign',
      params: [addressToSign, message],
    });
  }
}

export default function WalletConnect({ onConnect, address, compact = false }: WalletConnectProps) {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const saved = localStorage.getItem('wallet_address');
    const token = localStorage.getItem('auth_token');
    if (!saved || !token) {
      localStorage.removeItem('wallet_address');
      localStorage.removeItem('auth_token');
      onConnect('');
      return;
    }

    let mounted = true;
    api.me()
      .then((session) => {
        if (!mounted) return;
        localStorage.setItem('wallet_address', session.wallet_address);
        onConnect(session.wallet_address || saved);
      })
      .catch(() => {
        if (!mounted) return;
        localStorage.removeItem('wallet_address');
        localStorage.removeItem('auth_token');
        onConnect('');
      });

    return () => {
      mounted = false;
    };
  }, [onConnect]);

  async function connectWithSignature() {
    if (!window.ethereum) {
      throw new Error('MetaMask not found.');
    }

    const accounts = await window.ethereum.request<string[]>({ method: 'eth_requestAccounts' });
    const walletAddress = accounts[0];
    if (!walletAddress) throw new Error('No wallet account returned by MetaMask');

    try {
      const challenge = await api.createAuthChallenge(walletAddress);
      const signature = await signMessage(walletAddress, challenge.message);
      const session = await api.verifyAuthChallenge({
        wallet_address: walletAddress,
        nonce: challenge.nonce,
        signature,
      });

      localStorage.setItem('wallet_address', session.wallet_address);
      localStorage.setItem('auth_token', session.token);
      onConnect(session.wallet_address);
    } catch (error: unknown) {
      localStorage.removeItem('wallet_address');
      localStorage.removeItem('auth_token');
      onConnect('');
      throw error;
    }
  }

  async function withConnection(action: () => Promise<void>) {
    setConnecting(true);
    setError('');
    try {
      await action();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to connect wallet';
      setError(message);
    } finally {
      setConnecting(false);
    }
  }

  function disconnect() {
    localStorage.removeItem('wallet_address');
    localStorage.removeItem('auth_token');
    onConnect('');
  }

  if (address) {
    return (
      <div className="flex items-center gap-2">
        <span className="rounded-full border border-[var(--line)] bg-[var(--surface-2)] px-3 py-1.5 text-xs font-mono text-[var(--ink)]">
          {formatWallet(address)}
        </span>
        {!compact ? (
          <button onClick={disconnect} type="button" className="button-ghost text-xs">
            Disconnect
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button onClick={() => withConnection(connectWithSignature)} disabled={connecting} className="button-primary" type="button">
          Connect MetaMask
        </button>
      </div>
      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}

declare global {
  interface EthereumRequestArgs {
    method: string;
    params?: unknown[];
  }

  interface EthereumProvider {
    request: <T = unknown>(args: EthereumRequestArgs) => Promise<T>;
  }

  interface Window {
    ethereum?: EthereumProvider;
  }
}
