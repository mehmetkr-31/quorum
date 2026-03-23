import { createContext } from "@quorum/api/context";
import { appRouter } from "@quorum/api/routers/index";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { createFileRoute } from "@tanstack/react-router";

const rpcHandler = new RPCHandler(appRouter, {
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

async function handle({ request }: { request: Request }) {
  const rpcResult = await rpcHandler.handle(request, {
    prefix: "/api/rpc",
    context: await createContext({ req: request }),
  });
  if (rpcResult.response) return rpcResult.response;

  return new Response("Not found", { status: 404 });
}

export const Route = createFileRoute("/api/rpc/$")({
  server: {
    handlers: {
      GET: handle,
      POST: handle,
    },
  },
});
