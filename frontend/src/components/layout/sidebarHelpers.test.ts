import { describe, expect, it } from "vitest";
import { clampSidebarWidth, SIDEBAR_MAX, SIDEBAR_MIN } from "./SidebarResizeHandle";
import { formatNavCount } from "@/hooks/useNavCounts";
import { bellBadge } from "./NotificationsPanel";

describe("sidebar helpers", () => {
  it("clamps the sidebar width between min and max", () => {
    expect(clampSidebarWidth(100)).toBe(SIDEBAR_MIN);
    expect(clampSidebarWidth(500)).toBe(SIDEBAR_MAX);
    expect(clampSidebarWidth(271.6)).toBe(272);
  });

  it("formats nav counts, capping large numbers", () => {
    expect(formatNavCount(76)).toBe("76");
    expect(formatNavCount(9999)).toMatch(/9.?999/);
    expect(formatNavCount(10000)).toBe("9.9k+");
  });

  it("caps the bell badge at 9+", () => {
    expect(bellBadge(3)).toBe("3");
    expect(bellBadge(9)).toBe("9");
    expect(bellBadge(10)).toBe("9+");
  });
});
