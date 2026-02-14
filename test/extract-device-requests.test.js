import test from "node:test";
import assert from "node:assert/strict";

function extractDeviceRequestIds(text) {
  const s = String(text || "");
  const out = new Set();

  // Common patterns: requestId=XYZ, requestId: XYZ, "requestId":"XYZ".
  for (const m of s.matchAll(/requestId\s*(?:=|:)\s*([A-Za-z0-9_-]{6,})/g)) out.add(m[1]);
  for (const m of s.matchAll(/"requestId"\s*:\s*"([A-Za-z0-9_-]{6,})"/g)) out.add(m[1]);

  // CLI table output: bare UUIDs (v4) in table cells under "Pending" section.
  const pendingSection = s.split(/Paired\b/)[0]; // only look before "Paired" section
  for (const m of pendingSection.matchAll(/\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/gi)) out.add(m[1]);

  return Array.from(out);
}

test("extractDeviceRequestIds: finds requestId formats", () => {
  const sample = `pending:\n- requestId=abc123_DEF\n{"requestId":"REQ_456-xy"}\nrequestId: ZZZ999`;
  assert.deepEqual(extractDeviceRequestIds(sample).sort(), ["REQ_456-xy", "ZZZ999", "abc123_DEF"].sort());
});

test("extractDeviceRequestIds: finds UUIDs in CLI table output", () => {
  const table = `Pending (1)
┌──────────────────────────────────────┬───────────┬──────────┐
│ Request                              │ Device    │ Role     │
├──────────────────────────────────────┼───────────┼──────────┤
│ b1e0cb6b-c911-4e8e-af52-c9abac67ab3a │ 8092ab2b6 │ operator │
└──────────────────────────────────────┴───────────┴──────────┘
Paired (1)
┌────────────────────────────────────────────┬────────────┐
│ Device                                     │ Roles      │
├────────────────────────────────────────────┼────────────┤
│ 9331cda8cba0654c79d2e99afabea723f0f05a9ce4 │ operator   │
└────────────────────────────────────────────┴────────────┘`;
  assert.deepEqual(extractDeviceRequestIds(table), ["b1e0cb6b-c911-4e8e-af52-c9abac67ab3a"]);
});
