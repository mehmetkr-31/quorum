import type { QueryClient } from "@tanstack/react-query"
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from "@tanstack/react-router"
import { Toaster } from "sonner"
import Header from "@/components/header"
import { WalletProvider } from "@/components/WalletButton"
import type { orpc } from "@/utils/orpc"
import appCss from "../index.css?url"

export interface RouterAppContext {
  orpc: typeof orpc
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "Quorum | Community-Governed AI Dataset DAO",
      },
    ],
    links: [
      {
        rel: "preconnect",
        href: "https://fonts.googleapis.com",
      },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=Inter:wght@300;400;500;600&display=swap",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200",
      },
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  component: RootDocument,
})

function RootDocument() {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        <WalletProvider>
          <div className="min-h-screen selection:bg-primary/30">
            <Header />
            <main>
              <Outlet />
            </main>
            <footer className="bg-surface-container-lowest border-t border-outline-variant/15 w-full py-12 px-8">
              <div className="flex flex-col md:flex-row justify-between items-center gap-6 max-w-[1440px] mx-auto font-['Inter'] text-sm text-on-surface-variant">
                <div className="text-xl font-bold text-on-surface tracking-tighter">Quorum</div>
                <div className="flex flex-wrap justify-center gap-8">
                  <a
                    className="hover:text-tertiary transition-colors hover:underline decoration-tertiary/50"
                    href="/"
                  >
                    Privacy Policy
                  </a>
                  <a
                    className="hover:text-tertiary transition-colors hover:underline decoration-tertiary/50"
                    href="/"
                  >
                    Terms of Service
                  </a>
                  <a
                    className="hover:text-tertiary transition-colors hover:underline decoration-tertiary/50"
                    href="/"
                  >
                    Security Audit
                  </a>
                  <a
                    className="hover:text-tertiary transition-colors hover:underline decoration-tertiary/50"
                    href="/"
                  >
                    Github
                  </a>
                  <a
                    className="hover:text-tertiary transition-colors hover:underline decoration-tertiary/50"
                    href="/"
                  >
                    Discord
                  </a>
                </div>
                <div className="text-on-surface-variant/60">
                  © 2024 Quorum DAO. Governed by the Community.
                </div>
              </div>
            </footer>
          </div>
          <Toaster richColors position="top-right" />
        </WalletProvider>
        <Scripts />
      </body>
    </html>
  )
}
