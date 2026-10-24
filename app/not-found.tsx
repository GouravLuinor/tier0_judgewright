import Link from "next/link";
import { COMPANY } from "@/lib/site";

/** On-brand 404 — never a bare Next.js error page. */
export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center px-4 py-16">
      <p className="font-mono text-xs text-ink-3">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">
        No such route
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-3">
        The workstation lives at the tool route. Nothing was uploaded, so
        nothing leaked by landing here.
      </p>
      <Link
        href="/tools/judgewright"
        className="mt-6 inline-flex h-9 w-fit items-center justify-center rounded-[3px] border border-line bg-sunk px-4 text-sm font-medium text-ink transition-[background-color,border-color,color] duration-150 ease-out-expo hover:border-line-strong hover:bg-sunk focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-select/70 motion-reduce:transition-none"
      >
        Go to the workstation
      </Link>
      <a href={COMPANY.url} className="mt-4 w-fit text-sm text-ink-3 underline hover:text-ink">
        Judgewright is a free tool by Nor AI
      </a>
    </div>
  );
}
