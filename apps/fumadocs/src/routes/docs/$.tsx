import { createFileRoute, notFound } from "@tanstack/react-router"
import type { TOCItemType } from "fumadocs-core/toc"
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from "fumadocs-ui/page"
import type { FC } from "react"
import { source } from "../../lib/source"

export const Route = createFileRoute("/docs/$")({
  loader: ({ params }) => {
    const slug = (params as { _splat?: string })._splat?.split("/").filter(Boolean) ?? []
    const page = source.getPage(slug)
    if (!page) throw notFound()
    return page
  },
  component: DocPage,
})

function DocPage() {
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
