import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: () => (
    <div className="p-10">
      <h1 className="text-4xl font-bold">Quorum Docs</h1>
      <p className="mt-4">Welcome to the documentation.</p>
    </div>
  ),
});
