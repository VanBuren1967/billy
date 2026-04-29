'use client';

import { useFormStatus } from 'react-dom';

type Props = {
  children: React.ReactNode;
  pendingLabel?: React.ReactNode;
  className?: string;
};

export function SubmitButton({ children, pendingLabel, className }: Props) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
