import { os } from "@orpc/server";
import type { Context } from "./context";

export const o = os.$context<Context>();

export const publicProcedure = o;
// Auth can be added here once Better Auth is setup
export const protectedProcedure = publicProcedure;
