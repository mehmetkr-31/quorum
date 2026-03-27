import { createFileRoute, notFound } from "@tanstack/react-router"
import type { TOCItemType } from "fumadocs-core/toc"
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from "fumadocs-ui/page"
import type { FC } from "react"
import { source } from "../../lib/source"

export const Route = createFileRoute("/docs/")({
  loader: () => {
    const page = source.getPage([])
    if (!page) throw notFound()
    return page
  },
  component: DocIndexPage,
})

function DocIndexPage() {
  const page = Route.useLoaderData()
  const exports = page.data._exports as { default: FC; toc: TOCItemType[] }

  return (
    <DocsPage toc={exports.toc} full={page.data.full}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <exports.default />
      </DocsBody>
    </DocsPage>
  )
}
