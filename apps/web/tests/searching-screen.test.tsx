import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SearchingScreen } from "@/app/play/_shared/searching-screen";

describe("SearchingScreen", () => {
  it("renders the title and subtitle", () => {
    const html = renderToStaticMarkup(
      <SearchingScreen title="Finding you an opponent..." subtitle="0:07" />,
    );
    expect(html).toContain("Finding you an opponent...");
    expect(html).toContain("0:07");
  });

  it("renders a cancel button when onCancel is provided", () => {
    const html = renderToStaticMarkup(
      <SearchingScreen title="Searching" onCancel={() => {}} />,
    );
    expect(html).toContain("Cancel");
  });

  it("renders no cancel button without onCancel", () => {
    const html = renderToStaticMarkup(<SearchingScreen title="Creating" />);
    expect(html).not.toContain("Cancel");
  });
});
