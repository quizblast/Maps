import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { invokeLLM } from "./_core/llm";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";

const reportTypeSchema = z.enum(["police", "crash", "obstacle", "hazard"]);
const prioritySchema = z.enum(["3", "2", "1"]);

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  assistant: router({
    parseIntent: publicProcedure
      .input(z.object({ transcript: z.string().min(1).max(400) }))
      .mutation(async ({ input }) => {
        const lower = input.transcript.toLowerCase();
        const localReport = lower.match(/police|cop|crash|accident|obstacle|debris|hazard|pothole/);
        const localType = lower.includes("police") || lower.includes("cop") ? "police" : lower.includes("crash") || lower.includes("accident") ? "crash" : lower.includes("obstacle") || lower.includes("debris") ? "obstacle" : lower.includes("hazard") || lower.includes("pothole") ? "hazard" : undefined;

        if (localReport && localType) {
          return { intent: "report" as const, reportType: localType as z.infer<typeof reportTypeSchema>, message: `Ready to report a ${localType}.` };
        }

        try {
          const response = await invokeLLM({
            messages: [
              { role: "system", content: "You are Motion, a concise in-car navigation assistant. Extract a destination from a voice command. If the user says they are hungry, suggest a nearby food search. Return only JSON matching the schema." },
              { role: "user", content: input.transcript },
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "navigation_intent",
                strict: true,
                schema: {
                  type: "object",
                  properties: {
                    intent: { type: "string", enum: ["navigate", "search", "unknown"] },
                    destination: { type: ["string", "null"] },
                    message: { type: "string" },
                  },
                  required: ["intent", "destination", "message"],
                  additionalProperties: false,
                },
              },
            },
          });
          const content = response.choices?.[0]?.message?.content;
          const text = typeof content === "string" ? content : "";
          const parsed = JSON.parse(text) as { intent: "navigate" | "search" | "unknown"; destination: string | null; message: string };
          return parsed;
        } catch {
          if (/hungry|food|eat|restaurant|cafe|coffee/i.test(input.transcript)) return { intent: "search" as const, destination: "restaurants near me", message: "Showing food nearby." };
          return { intent: "unknown" as const, destination: null, message: `I heard “${input.transcript}”. Try “take me to…”` };
        }
      }),
  }),
  reports: router({
    submit: publicProcedure
      .input(z.object({ type: reportTypeSchema, priority: prioritySchema, note: z.string().max(240).optional(), location: z.string().min(1) }))
      .mutation(({ input, ctx }) => ({
        success: true as const,
        report: {
          ...input,
          reporter: ctx.user?.name ?? "Anonymous driver",
          createdAt: new Date().toISOString(),
        },
      })),
  }),
});

export type AppRouter = typeof appRouter;
