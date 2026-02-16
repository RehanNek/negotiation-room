'use client';

import ContractQueueCard from '@/components/ContractQueueCard';
import type { ContractViewModel } from '@/lib/types';

interface ContractCardProps {
  contract: ContractViewModel;
  onResolve?: (id: string) => void;
}

export default function ContractCard({ contract, onResolve }: ContractCardProps) {
  return <ContractQueueCard contract={contract} onResolve={onResolve} />;
}
