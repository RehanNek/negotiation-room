'use client';

import { useState, useEffect } from 'react';

interface WalletConnectProps {
  onConnect: (address: string) => void;
  address: string | null;
}

export default function WalletConnect({ onConnect, address }: WalletConnectProps) {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const saved = localStorage.getItem('wallet_address');
    if (saved) onConnect(saved);
  }, [onConnect]);

  async function connect() {
    setConnecting(true);
    setError('');
    try {
      if (typeof window.ethereum === 'undefined') {
        setError('MetaMask not found. Please install MetaMask.');
        return;
      }
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      const addr = accounts[0];
      localStorage.setItem('wallet_address', addr);
      onConnect(addr);
    } catch (err: any) {
      setError(err.message || 'Failed to connect wallet');
    } finally {
      setConnecting(false);
    }
  }

  function disconnect() {
    localStorage.removeItem('wallet_address');
    onConnect('');
  }

  if (address) {
    return (
      <div className="flex items-center gap-3">
        <span className="px-3 py-1.5 bg-green-900/30 border border-green-700 rounded-lg text-green-400 text-sm font-mono">
          {address.slice(0, 6)}...{address.slice(-4)}
        </span>
        <button onClick={disconnect} className="text-sm text-gray-400 hover:text-white transition">
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={connect}
        disabled={connecting}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 rounded-lg font-medium transition"
      >
        {connecting ? 'Connecting...' : 'Connect Wallet'}
      </button>
      {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
    </div>
  );
}

declare global {
  interface Window {
    ethereum?: any;
  }
}
