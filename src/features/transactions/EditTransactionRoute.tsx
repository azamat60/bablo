import { useParams } from 'react-router';
import { TransactionForm } from '@/features/add';

export function EditTransactionRoute() {
  const { id } = useParams<{ id: string }>();
  return <TransactionForm transactionId={id} />;
}
