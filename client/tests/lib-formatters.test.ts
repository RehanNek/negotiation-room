import {
  buildReadableContractSummary,
  extractMissingTerms,
  formatMissingTermLabel,
  formatWeiToEth,
  formatRelativeStatusHint,
  formatTimestamp,
  formatWallet,
  selectDisplayTerms,
  stringifyRaw,
  summarizeOfferTerms,
} from '@/lib/formatters';
import { describe, expect, it } from 'vitest';

describe('formatters', () => {
  it('humanizes structured offer terms', () => {
    const summary = summarizeOfferTerms({
      max_price: 500.5,
      is_binding: true,
      tags: ['fast', 'private'],
      metadata: { tier: 'gold' },
    });

    expect(summary).toEqual([
      { key: 'max_price', label: 'Max Price', value: '500.5' },
      { key: 'is_binding', label: 'Is Binding', value: 'Yes' },
      { key: 'tags', label: 'Tags', value: 'fast, private' },
      { key: 'metadata', label: 'Metadata', value: 'Tier: gold' },
    ]);
  });

  it('returns empty list for non-object terms', () => {
    expect(summarizeOfferTerms(null)).toEqual([]);
    expect(summarizeOfferTerms('plain text')).toEqual([]);
    expect(summarizeOfferTerms(['a', 'b'])).toEqual([]);
  });

  it('falls back safely for non-serializable values', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(stringifyRaw(circular)).toBe('[object Object]');
  });

  it('formats wallet and timestamp edge cases', () => {
    expect(formatWallet(undefined)).toBe('Unknown Wallet');
    expect(formatWallet('0x1234567890abcdef')).toBe('0x1234...cdef');
    expect(formatWallet('abcd', 3, 3)).toBe('abcd');

    expect(formatTimestamp(undefined)).toBe('Unknown time');
    expect(formatTimestamp('not-a-date')).toBe('not-a-date');
  });

  it('formats wei amounts into ETH string safely', () => {
    expect(formatWeiToEth('1000000000000000000')).toBe('1 ETH');
    expect(formatWeiToEth('25000000000000000')).toBe('0.025 ETH');
    expect(formatWeiToEth(undefined)).toBe('n/a');
  });

  it('maps relative status hints', () => {
    expect(formatRelativeStatusHint('pending_resolution')).toBe('Rule check required before final outcome.');
    expect(formatRelativeStatusHint('active')).toBe('Live and accepting actions.');
  });

  it('sanitizes noisy contract summaries and provides fallback', () => {
    const noisy = 'We need to generate a summary: contract is service. Provide 2-3 sentences.';
    const fallback = buildReadableContractSummary('service', noisy, { raw: 'cool lets do it' });
    expect(fallback).toContain('Service contract recorded');
    expect(fallback).toContain('Message: cool lets do it');
  });

  it('retains clean contract summaries', () => {
    const clean = 'Service agreement to deliver violin lessons this week for 2 ETH.';
    expect(buildReadableContractSummary('service', clean, { amount: 2, token: 'ETH' })).toBe(clean);
  });

  it('prefers agreed terms and exposes missing-term labels', () => {
    const selected = selectDisplayTerms({
      agreed_terms: {
        deliverables: '3 lessons',
        price_amount: 220,
        currency: 'USD',
      },
      missing_terms: ['timeline_or_schedule'],
    }) as Record<string, unknown>;

    expect(selected.deliverables).toBe('3 lessons');
    expect(extractMissingTerms({ missing_terms: ['timeline_or_schedule', 'timeline_or_schedule', 'price'] })).toEqual([
      'timeline_or_schedule',
      'price',
    ]);
    expect(formatMissingTermLabel('timeline_or_schedule')).toBe('Timeline or schedule');
  });
});
