import { createFileRoute, Outlet } from "@tanstack/react-router"
import { DocsLayout } from "fumadocs-ui/layouts/docs"
import { docs } from "../../.source/server"

export const Route = createFileRoute("/docs")({
  component: DocsLayoutRoute,
})

function DocsLayoutRoute() {
  return (
    <DocsLayout
      tree={docs.pageTree}
      nav={{ title: "Quorum Docs" }}
      sidebar={{ defaultOpenLevel: 1 }}
    >
      <Outlet />
    </DocsLayout>
  )
}
