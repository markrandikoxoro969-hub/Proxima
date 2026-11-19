import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Faq, FAQS } from "./faq";

describe("<Faq />", () => {
  it("uses native, keyboard-friendly <details> that open one at a time", () => {
    const { container } = render(<Faq />);
    const items = container.querySelectorAll("details");
    expect(items).toHaveLength(FAQS.length);
    items.forEach((d) => expect(d).toHaveAttribute("name", "faq"));
    expect(screen.getByText("Which files can I attach?")).toBeInTheDocument();
    expect(screen.getByText(/up to 3 files per message, 100 KB each/)).toBeInTheDocument();
  });

  it("adds valid FAQ structured data for Google", () => {
    const { container } = render(<Faq />);
    const script = container.querySelector('script[type="application/ld+json"]')!;
    expect(script.innerHTML).not.toContain("<");
    const data = JSON.parse(script.innerHTML);
    expect(data["@type"]).toBe("FAQPage");
    expect(data.mainEntity).toHaveLength(FAQS.length);
  });
});
