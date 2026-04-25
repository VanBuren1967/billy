export function SignOutButton() {
  return (
    <form action="/auth/sign-out" method="post">
      <button
        type="submit"
        className="text-bone-muted hover:text-bone text-xs tracking-widest uppercase transition"
      >
        Sign out
      </button>
    </form>
  );
}
