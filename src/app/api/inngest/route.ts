// Inngest's HTTP entry point for this app. Inngest's dev server and cloud
// relay send function invocations here; we dispatch them to the functions
// registered in src/inngest/functions.ts.
//
// Local dev: run `npx inngest-cli@latest dev` in a second terminal — it
// auto-discovers this endpoint at http://localhost:3000/api/inngest.

import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { allFunctions } from "@/inngest/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: allFunctions,
});
