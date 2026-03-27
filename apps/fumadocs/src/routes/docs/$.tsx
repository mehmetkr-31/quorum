import { createFileRoute, notFound } from "@tanstack/react-router"
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from "fumadocs-ui/page"
import { docs } from "../../../.source/server"

export const Route = createFileRoute("/docs/$")({
  loader: ({ params }) => {
    const slug = (params as { _splat?: string })._splat?.split("/").filter(Boolean) ?? []
    const page = docs.getPage(slug)
    if (!page) throw notFound()
    return page
  },
  component: DocPage,
})

function DocPage() {
  const page = Route.useLoaderData()
  const MDX = page.data.exports.default

  return (
    <DocsPage toc={page.data.exports.toc} full={page.data.full}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <MDX />
      </DocsBody>
    </DocsPage>
  )
}
