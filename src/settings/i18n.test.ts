import { describe, expect, it } from "vitest";
import { plural, translate } from "./i18n";

describe("settings localization", () => {
  it("switches known settings copy between Chinese and English", () => {
    expect(translate("zh-CN", "桌面伙伴设置")).toBe("桌面伙伴设置");
    expect(translate("en", "桌面伙伴设置")).toBe("Desktop Companion Settings");
    expect(translate("en", "未知文案")).toBe("未知文案");
  });

  it("formats localized counts", () => {
    expect(plural("zh-CN", 2, "动画", "animation")).toBe("2 个动画");
    expect(plural("en", 1, "动画", "animation")).toBe("1 animation");
    expect(plural("en", 2, "动画", "animation")).toBe("2 animations");
  });
});
