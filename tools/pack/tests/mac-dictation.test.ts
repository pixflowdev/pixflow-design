import { expect, it } from "vitest";
import { verifyMacDictationSource } from "../src/mac/dictation.js";

it("rejects truncated and same-size tampered dictation source archives before extraction", () => {
  expect(() => verifyMacDictationSource(Buffer.from("truncated"))).toThrow(/verification/);
  expect(() => verifyMacDictationSource(Buffer.alloc(9631456))).toThrow(/verification/);
});
