import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { formatTable } from "../../formatters/table.js";

describe("table formatter", () => {
  it("renders aligned ASCII tables", () => {
    const output = formatTable(
      [
        { header: "Name" },
        { header: "Count", align: "right" },
      ],
      [["alpha", "2"]],
      { padding: 0 },
    );

    assert.equal(
      output,
      [
        "+-----+-----+",
        "|Name |Count|",
        "+-----+-----+",
        "|alpha|    2|",
        "+-----+-----+",
      ].join("\n"),
    );
  });

  it("supports disabling headers", () => {
    const output = formatTable([{ header: "Only" }], [["value"]], {
      includeHeader: false,
      padding: 0,
    });

    assert.equal(
      output,
      [
        "+-----+",
        "|value|",
        "+-----+",
      ].join("\n"),
    );
  });

  it("sanitizes newline and surrounding whitespace in cells", () => {
    const output = formatTable([{ header: "Text" }], [["  line\nvalue  "]], {
      padding: 0,
    });

    assert.match(output, /line value/);
  });

  it("throws for invalid table shapes", () => {
    assert.throws(() => {
      formatTable([], []);
    });

    assert.throws(() => {
      formatTable([{ header: "A" }, { header: "B" }], [["only-one"]]);
    });
  });
});
