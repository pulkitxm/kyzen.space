import Link from "next/link";

const featuredGames = [
  {
    name: "Old Maid",
    description:
      "A multiplayer card game with room codes, smooth lobby flow, and a polished in-game experience.",
    href: "/oldmaid",
    status: "Live",
    meta: ["2-4 players", "Room-based", "Turn-driven"],
  },
  {
    name: "Playing Cards Hub",
    description:
      "Shared card-game foundations for future titles, built to stay consistent across the library.",
    href: "/oldmaid",
    status: "Foundation",
    meta: ["Reusable UI", "Shared assets", "Scalable routes"],
  },
];

const roadmap = [
  {
    title: "Library-first structure",
    text: "Each game gets its own route, so the main page stays clean and easy to expand.",
  },
  {
    title: "Polished game shells",
    text: "Games can keep their own visual identity without leaking implementation details into the hub.",
  },
  {
    title: "Room-friendly routing",
    text: "Room codes and multiplayer states stay inside the game route, not in a static index file.",
  },
];

export default function Home() {
  return (
    <main className="relative isolate overflow-hidden px-4 py-6 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute left-1/2 top-[-10rem] h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-emerald-400/15 blur-3xl" />
        <div className="absolute right-[-8rem] top-[18rem] h-[20rem] w-[20rem] rounded-full bg-amber-400/10 blur-3xl" />
        <div className="absolute bottom-[-10rem] left-[-6rem] h-[18rem] w-[18rem] rounded-full bg-cyan-400/10 blur-3xl" />
      </div>

      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-7xl flex-col">
        <header className="flex flex-col gap-4 border-b border-white/10 pb-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-white/45">
              Game Library
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Multiple games, one clean home.
            </h1>
          </div>
          <div className="flex items-center gap-3 text-sm text-white/70">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
              App Router
            </span>
            <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-emerald-100">
              Old Maid ready
            </span>
          </div>
        </header>

        <section className="grid flex-1 gap-6 py-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center lg:py-12">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium uppercase tracking-[0.28em] text-white/60">
              Playing cards section
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </div>

            <h2 className="mt-6 text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl">
              A professional hub for the Old Maid game and future card titles.
            </h2>

            <p className="mt-5 max-w-xl text-base leading-7 text-white/70 sm:text-lg">
              The root page now acts as a proper game library instead of a raw index file.
              Each game gets its own route, and Old Maid keeps its multiplayer flow intact.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/oldmaid"
                className="inline-flex items-center justify-center rounded-2xl bg-white px-5 py-3.5 text-sm font-semibold text-[#07100d] transition hover:-translate-y-0.5 hover:bg-amber-100"
              >
                Open Old Maid
              </Link>
              <a
                href="#featured-games"
                className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-5 py-3.5 text-sm font-semibold text-white/90 transition hover:border-white/20 hover:bg-white/10"
              >
                Explore the library
              </a>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/5 p-4 shadow-2xl shadow-black/20 backdrop-blur-xl">
            <div className="rounded-[1.5rem] border border-white/10 bg-[#0d1b16] p-5">
              <div className="flex items-center justify-between text-sm text-white/55">
                <span>Featured game</span>
                <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-100">
                  Live
                </span>
              </div>

              <h3 className="mt-4 text-3xl font-semibold tracking-tight text-white">
                Old Maid
              </h3>
              <p className="mt-3 text-sm leading-6 text-white/65">
                Create or join a room, share a code with friends, and play through the full lobby-to-game flow.
              </p>

              <div className="mt-5 grid gap-2 sm:grid-cols-3">
                {featuredGames[0].meta.map((item) => (
                  <div
                    key={item}
                    className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-center text-xs font-medium text-white/75"
                  >
                    {item}
                  </div>
                ))}
              </div>

              <Link
                href={featuredGames[0].href}
                className="mt-5 inline-flex w-full items-center justify-center rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-[#08120f] transition hover:bg-emerald-300"
              >
                Launch game
              </Link>
            </div>
          </div>
        </section>

        <section id="featured-games" className="pb-10">
          <div className="grid gap-4 md:grid-cols-2">
            {featuredGames.map((game) => (
              <article
                key={game.name}
                className="rounded-[1.75rem] border border-white/10 bg-white/6 p-5 shadow-lg shadow-black/10 backdrop-blur"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.25em] text-white/40">
                      {game.status}
                    </p>
                    <h3 className="mt-2 text-xl font-semibold text-white">{game.name}</h3>
                  </div>
                  <div className="h-10 w-10 rounded-2xl border border-white/10 bg-white/5" />
                </div>

                <p className="mt-3 text-sm leading-6 text-white/70">{game.description}</p>

                <div className="mt-4 flex flex-wrap gap-2">
                  {game.meta.map((item) => (
                    <span
                      key={item}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/70"
                    >
                      {item}
                    </span>
                  ))}
                </div>

                <div className="mt-5 flex items-center gap-3">
                  <Link
                    href={game.href}
                    className="inline-flex items-center justify-center rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-[#07100d] transition hover:bg-amber-100"
                  >
                    Open
                  </Link>
                  <span className="text-sm text-white/45">
                    Dedicated route, no static index file.
                  </span>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="grid gap-4 border-t border-white/10 py-8 md:grid-cols-3">
          {roadmap.map((item) => (
            <article
              key={item.title}
              className="rounded-[1.5rem] border border-white/10 bg-black/10 p-5 backdrop-blur"
            >
              <h3 className="text-base font-semibold text-white">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-white/60">{item.text}</p>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
