import { approveJoinRequest, declineJoinRequest } from './actions';

type Request = {
  id: string;
  name: string;
  email: string;
  message: string | null;
  created_at: string;
  status: 'pending' | 'approved' | 'declined';
};

export function RequestCard({ request }: { request: Request }) {
  const submittedAt = new Date(request.created_at).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const isPending = request.status === 'pending';

  return (
    <article className="border-hairline-strong bg-ink-900 border p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-bone font-serif text-xl">{request.name}</h3>
          <p className="text-bone-muted text-sm">{request.email}</p>
        </div>
        <span className="text-bone-faint text-xs tracking-widest uppercase">{submittedAt}</span>
      </header>

      {request.message && (
        <p className="text-bone-muted border-hairline-strong mt-4 border-l-2 pl-4 text-sm leading-relaxed whitespace-pre-line">
          {request.message}
        </p>
      )}

      {isPending ? (
        <div className="mt-6 flex gap-3">
          <form action={approveJoinRequest}>
            <input type="hidden" name="requestId" value={request.id} />
            <button
              type="submit"
              className="border-gold text-gold hover:bg-gold hover:text-ink-950 focus-visible:outline-gold border px-5 py-2 text-xs tracking-widest uppercase transition focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Approve &amp; invite
            </button>
          </form>
          <form action={declineJoinRequest}>
            <input type="hidden" name="requestId" value={request.id} />
            <button
              type="submit"
              className="border-hairline-strong text-bone-muted hover:text-bone focus-visible:outline-gold border px-5 py-2 text-xs tracking-widest uppercase transition focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Decline
            </button>
          </form>
        </div>
      ) : (
        <p className="text-bone-faint mt-6 text-xs tracking-widest uppercase">
          {request.status}
        </p>
      )}
    </article>
  );
}
