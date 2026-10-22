import { describe, expect, it, vi } from "vitest";
import { effectiveDocStatus, hasDocumentOnFile, normalizeDocStatus, summarizeDocs } from "../documentStatus";

describe("document status", () => {
  it("treats pending_review as pending", () => { expect(normalizeDocStatus("pending_review")).toBe("pending"); expect(normalizeDocStatus(null)).toBe("pending"); });
  it("an uploaded document is never missing, whatever its status", () => {
    for (const status of ["pending_review", "pending", "approved", "rejected", null]) expect(hasDocumentOnFile(summarizeDocs([{ status }]), null)).toBe(true);
  });
  it("nothing recorded and no profile link is missing", () => { expect(hasDocumentOnFile(summarizeDocs([]), null)).toBe(false); expect(hasDocumentOnFile(undefined, "  ")).toBe(false); });
  it("a profile link alone counts as on file and waits for review", () => { expect(hasDocumentOnFile(undefined, "abc/permit.jpg")).toBe(true); expect(effectiveDocStatus(undefined, "abc/permit.jpg")).toBe("pending"); });
  it("the current file decides, not an old replaced one", () => {
    expect(summarizeDocs([{ status: "rejected", is_current: false }, { status: "approved", is_current: true }]).status).toBe("approved");
    expect(summarizeDocs([{ status: "approved", is_current: false }, { status: "pending_review", is_current: true }]).status).toBe("pending");
  });
  it("falls back to old files when none is flagged current", () => { expect(summarizeDocs([{ status: "rejected", is_current: false }]).status).toBe("rejected"); });
});

describe("fetchDocSummaries", () => {
  it("finds a permit that exists only in the documents table (the Josie Monday case: uploaded, profile link empty)", async () => {
    vi.resetModules();
    vi.doMock("@/integrations/supabase/client", () => ({
      supabase: {
        from: (table: string) => ({
          select: () => ({
            in: async () => ({
              data: table === "permit_documents" ? [{ student_id: "u1", status: "pending_review", is_current: true }] : [],
            }),
          }),
        }),
      },
    }));
    const m = await import("../documentStatus");
    const sums = await m.fetchDocSummaries(["u1", "u2"]);
    expect(m.hasDocumentOnFile(sums.get("u1"), null)).toBe(true);
    expect(m.effectiveDocStatus(sums.get("u1"), null)).toBe("pending");
    expect(m.hasDocumentOnFile(sums.get("u2"), null)).toBe(false);
  });
  it("reads the older permits table too", async () => {
    vi.resetModules();
    vi.doMock("@/integrations/supabase/client", () => ({
      supabase: { from: (table: string) => ({ select: () => ({ in: async () => ({ data: table === "permits" ? [{ user_id: "u3", verified_status: "approved" }] : [] }) }) }) },
    }));
    const m = await import("../documentStatus");
    expect((await m.fetchDocSummaries(["u3"])).get("u3")?.status).toBe("approved");
  });
  it("a failing lookup does not throw", async () => {
    vi.resetModules();
    vi.doMock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ select: () => ({ in: async () => { throw new Error("offline"); } }) }) } }));
    const m = await import("../documentStatus");
    expect((await m.fetchDocSummaries(["u4"])).size).toBe(0);
  });
});
