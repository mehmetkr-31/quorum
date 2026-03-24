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
        title: "Quorum DAO",
      },
    ],
    links: [
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
          <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans selection:bg-indigo-500/30">
            <Header />
            <main>
              <Outlet />
            </main>
            <footer className="border-t border-neutral-800 py-12 px-6 text-center">
              <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
                <div className="flex items-center gap-2 grayscale opacity-50">
                  <span className="text-xl">🏛️</span>
                  <span className="text-lg font-bold tracking-tight">QUORUM</span>
                </div>
                <p className="text-neutral-500 text-sm">Powered by Aptos & Shelby Protocol</p>
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
