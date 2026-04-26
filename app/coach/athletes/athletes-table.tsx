import Link from 'next/link';

type Athlete = {
  id: string;
  name: string;
  email: string;
  status: 'invited' | 'active' | 'inactive';
  invited_at: string | null;
  accepted_at: string | null;
  created_at: string;
};

const STATUS_LABEL: Record<Athlete['status'], string> = {
  invited: 'Invited',
  active: 'Active',
  inactive: 'Inactive',
};

const STATUS_COLOR: Record<Athlete['status'], string> = {
  invited: 'text-gold',
  active: 'text-bone',
  inactive: 'text-bone-faint',
};

function fmt(dt: string | null) {
  if (!dt) return '—';
  return new Date(dt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function AthletesTable({ athletes }: { athletes: Athlete[] }) {
  if (athletes.length === 0) {
    return (
      <div className="border-hairline-strong border p-12 text-center">
        <p className="text-bone-muted">No athletes yet.</p>
        <Link
          href="/coach/athletes/invite"
          className="text-gold mt-6 inline-block text-xs tracking-widest uppercase underline"
        >
          Invite your first athlete
        </Link>
      </div>
    );
  }

  return (
    <div className="border-hairline-strong overflow-x-auto border">
      <table className="w-full text-left text-sm">
        <thead className="border-hairline-strong text-bone-faint border-b text-xs tracking-widest uppercase">
          <tr>
            <th className="px-5 py-3 font-normal">Name</th>
            <th className="px-5 py-3 font-normal">Email</th>
            <th className="px-5 py-3 font-normal">Status</th>
            <th className="px-5 py-3 font-normal">Joined</th>
            <th className="sr-only px-5 py-3 font-normal">Actions</th>
          </tr>
        </thead>
        <tbody>
          {athletes.map((a) => (
            <tr key={a.id} className="border-hairline border-b last:border-0">
              <td className="text-bone px-5 py-4 font-serif">{a.name}</td>
              <td className="text-bone-muted px-5 py-4">{a.email}</td>
              <td
                className={`px-5 py-4 text-xs tracking-widest uppercase ${STATUS_COLOR[a.status]}`}
              >
                {STATUS_LABEL[a.status]}
              </td>
              <td className="text-bone-muted px-5 py-4">{fmt(a.accepted_at ?? a.invited_at)}</td>
              <td className="px-5 py-4 text-right">
                <Link
                  href={`/coach/athletes/${a.id}`}
                  className="text-gold text-xs tracking-widest uppercase underline"
                >
                  View
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
