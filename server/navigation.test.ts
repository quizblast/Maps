import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createPublicContext(): TrpcContext {
  return {
    user: undefined,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as TrpcContext["res"],
  };
}

describe("navigation assistant", () => {
  it("turns a police voice command into a report intent without calling an external model", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.assistant.parseIntent({ transcript: "Hey Gemini, there is a police car ahead" });

    expect(result.intent).toBe("report");
    expect(result.reportType).toBe("police");
  });

  it("accepts a prioritized road report and returns a timestamped share result", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.reports.submit({
      type: "obstacle",
      priority: "2",
      location: "Willow Lane & Pine Street",
      note: "blocking the right lane",
    });

    expect(result.success).toBe(true);
    expect(result.report.priority).toBe("2");
    expect(result.report.type).toBe("obstacle");
    expect(result.report.createdAt).toEqual(expect.any(String));
  });
});
