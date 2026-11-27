import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Layers } from "lucide-react";
import PageHeader, { badgeToneClasses } from "./PageHeader";

describe("PageHeader", () => {
  it("renders one h1 with the shared title classes", () => {
    const html = renderToStaticMarkup(<PageHeader title="Shipments" description="All shipments" />);
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain('class="text-2xl font-bold tracking-tight text-gray-950"');
    expect(html).toContain("text-sm text-slate-500");
  });

  it("colours role badges emerald for suppliers and blue for admins", () => {
    expect(badgeToneClasses("role", true).pill).toContain("bg-emerald-50");
    expect(badgeToneClasses("role", false).pill).toContain("bg-blue-50");
    expect(badgeToneClasses("neutral", true).pill).toContain("bg-slate-50");
    expect(badgeToneClasses("warning", false).pill).toContain("bg-amber-50");
  });

  it("renders the badge pill with its icon", () => {
    const html = renderToStaticMarkup(
      <PageHeader title="POs" badge={{ label: "Manual Process", icon: Layers, tone: "role" }} />
    );
    expect(html).toContain("rounded-full text-xs font-semibold shadow-2xs border");
    expect(html).toContain("<svg");
    expect(html).toContain("Manual Process");
  });

  it("supports mono code titles with an id for aria-labelledby", () => {
    const html = renderToStaticMarkup(<PageHeader title="PO 2001609235" mono titleId="po-title" />);
    expect(html).toContain('id="po-title"');
    expect(html).toContain("font-mono");
  });
});
