export function SignOutButton() {
  return (
    <form action="/auth/sign-out" method="post">
      <button
        type="submit"
        className="text-xs uppercase tracking-widest text-bone-muted transition hover:text-bone"
      >
        Sign out
      </button>
    </form>
  );
}
