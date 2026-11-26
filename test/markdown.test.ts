import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown } from "../components/markdown";

describe("Markdown lists", () => {
  it("nests indented items and keeps numbering across blank lines", () => {
    const md = "1. **Unblock deals**\n   * **Owner:** Riya\n   * Due 2025-04-25\n\n2. **Revise cold outreach**\n   - Owner: Nisha";
    const html = renderToStaticMarkup(React.createElement(Markdown, { text: md }));
    expect((html.match(/<ol/g) || []).length).toBe(1);
    expect((html.match(/<ul/g) || []).length).toBe(2);
    expect(html).toContain("<b>Owner:</b> Riya");
  });
  it("renders italics and bold", () => {
    const html = renderToStaticMarkup(React.createElement(Markdown, { text: "*Due:* soon and **x**" }));
    expect(html).toContain("<i>Due:</i>");
    expect(html).toContain("<b>x</b>");
  });
});
