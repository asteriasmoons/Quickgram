import { describe, expect, it } from "vitest";
import {
  getPostOrReelShortcodeFromLink,
  shortcodeToMediaId
} from "./shortcode.js";

describe("Instagram shortcode helpers", () => {
  it("extracts post and reel shortcodes", () => {
    expect(
      getPostOrReelShortcodeFromLink("https://www.instagram.com/p/DFx_jLuACs3/")
    ).toBe("DFx_jLuACs3");
    expect(
      getPostOrReelShortcodeFromLink("https://www.instagram.com/reel/C59DWpvOpgF")
    ).toBe("C59DWpvOpgF");
  });

  it("converts shortcode to media id", () => {
    expect(shortcodeToMediaId("C0KuSEuI_JU")).toBe("3245610033633030740");
  });
});
