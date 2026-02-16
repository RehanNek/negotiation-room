'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { Suspense } from 'react';

function VerifyContent() {
  const searchParams = useSearchParams();
  const [attestationId, setAttestationId] = useState(searchParams.get('id') || '');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const id = searchParams.get('id');
    if (id) {
      setAttestationId(id);
      verify(id);
    }
  }, [searchParams]);

  async function verify(id?: string) {
    const target = id || attestationId.trim();
    if (!target) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await api.verifyAttestation(target);
      setResult(res);
    } catch (err: any) {
      setError(err.message || 'Attestation not found or invalid');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <h1 className="text-3xl font-bold">Verify Attestation</h1>
      <p className="text-gray-400">Paste an attestation ID to verify its authenticity and view the resolution proof.</p>

      <div className="flex gap-3">
        <input
          value={attestationId}
          onChange={(e) => setAttestationId(e.target.value)}
          placeholder="Attestation ID"
          className="flex-1 p-3 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 font-mono focus:outline-none focus:border-blue-500"
        />
        <button
          onClick={() => verify()}
          disabled={loading || !attestationId.trim()}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 rounded-lg font-medium transition"
        >
          {loading ? 'Verifying...' : 'Verify'}
        </button>
      </div>

      {error && (
        <div className="p-4 border border-red-700 bg-red-900/10 rounded-xl">
          <p className="text-red-400">{error}</p>
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div className={`p-4 border rounded-xl ${
            result.valid ? 'border-green-700 bg-green-900/10' : 'border-red-700 bg-red-900/10'
          }`}>
            <p className={`text-lg font-bold ${result.valid ? 'text-green-400' : 'text-red-400'}`}>
              {result.valid ? 'VALID ATTESTATION' : 'INVALID ATTESTATION'}
            </p>
          </div>

          <div className="border border-gray-800 rounded-xl p-5 space-y-3">
            <h3 className="font-bold">Attestation Details</h3>
            <div className="text-sm space-y-2">
              <div>
                <span className="text-gray-400">ID: </span>
                <span className="font-mono text-xs">{result.attestation.id}</span>
              </div>
              <div>
                <span className="text-gray-400">Contract ID: </span>
                <span className="font-mono text-xs">{result.attestation.contract_id}</span>
              </div>
              <div>
                <span className="text-gray-400">Type: </span>
                <span>{result.attestation.type}</span>
              </div>
              <div>
                <span className="text-gray-400">Data Hash: </span>
                <span className="font-mono text-xs break-all">{result.attestation.data_hash}</span>
              </div>
              <div>
                <span className="text-gray-400">TEE Signature: </span>
                <span className="font-mono text-xs break-all">{result.attestation.tee_signature}</span>
              </div>
              <div>
                <span className="text-gray-400">Created: </span>
                <span>{result.attestation.created_at}</span>
              </div>
            </div>
          </div>

          {result.attestation.payload && (
            <div className="border border-gray-800 rounded-xl p-5">
              <h3 className="font-bold mb-3">Resolution Proof</h3>
              <pre className="text-xs text-gray-400 overflow-x-auto bg-gray-900 p-4 rounded-lg">
                {JSON.stringify(result.attestation.payload, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<div className="text-gray-400">Loading...</div>}>
      <VerifyContent />
    </Suspense>
  );
}
