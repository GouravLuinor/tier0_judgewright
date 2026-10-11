import Link from "next/link";

/** On-brand 404 — never a bare Next.js error page. */
export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center px-4 py-16">
      <p className="font-mono text-xs text-zinc-400">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-100">
        No such route
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-zinc-400">
        The workstation lives at the tool route. Nothing was uploaded, so
        nothing leaked by landing here.
      </p>
      <Link
        href="/tools/judgewright"
        className="mt-6 inline-flex h-9 w-fit items-center justify-center rounded-lg border border-surface-border bg-surface-subtle px-4 text-sm font-medium text-zinc-200 transition-[background-color,border-color,color,transform] duration-150 ease-out-expo hover:border-surface-borderHover hover:bg-surface-elevated active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-lime/70 motion-reduce:transition-none"
      >
        Go to the workstation
      </Link>
    </div>
  );
}
