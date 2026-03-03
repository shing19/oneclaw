export type TableAlignment = "left" | "right";

export interface TableColumn {
  header: string;
  align?: TableAlignment;
}

export interface TableFormatterOptions {
  includeHeader?: boolean;
  padding?: number;
}

type TableRow = readonly string[];

const DEFAULT_PADDING = 1;

export function formatTable(
  columns: readonly TableColumn[],
  rows: readonly TableRow[],
  options: TableFormatterOptions = {},
): string {
  if (columns.length === 0) {
    throw new Error("Table must include at least one column.");
  }

  assertRowLength(columns, rows);

  const padding = resolvePadding(options.padding);
  const includeHeader = options.includeHeader !== false;
  const widths = computeColumnWidths(columns, rows);
  const border = buildBorder(widths, padding);
  const lines: string[] = [border];

  if (includeHeader) {
    const headerCells = columns.map((column): string => sanitizeCell(column.header));
    lines.push(buildRow(headerCells, widths, columns, padding));
    lines.push(border);
  }

  for (const row of rows) {
    const cells = row.map((cell): string => sanitizeCell(cell));
    lines.push(buildRow(cells, widths, columns, padding));
  }

  lines.push(border);
  return lines.join("\n");
}

function assertRowLength(columns: readonly TableColumn[], rows: readonly TableRow[]): void {
  for (const [index, row] of rows.entries()) {
    if (row.length !== columns.length) {
      throw new Error(
        `Table row ${String(index)} has ${String(row.length)} cells; expected ${String(columns.length)}.`,
      );
    }
  }
}

function resolvePadding(value: number | undefined): number {
  if (value === undefined) {
    return DEFAULT_PADDING;
  }
  return Number.isInteger(value) && value >= 0 ? value : DEFAULT_PADDING;
}

function computeColumnWidths(
  columns: readonly TableColumn[],
  rows: readonly TableRow[],
): readonly number[] {
  return columns.map((column, columnIndex): number => {
    let width = sanitizeCell(column.header).length;
    for (const row of rows) {
      const cellWidth = sanitizeCell(row[columnIndex] ?? "").length;
      if (cellWidth > width) {
        width = cellWidth;
      }
    }
    return width;
  });
}

function buildBorder(widths: readonly number[], padding: number): string {
  const segments = widths.map((width): string => "-".repeat(width + padding * 2));
  return `+${segments.join("+")}+`;
}

function buildRow(
  cells: readonly string[],
  widths: readonly number[],
  columns: readonly TableColumn[],
  padding: number,
): string {
  const rendered = cells.map((cell, index): string => {
    const width = widths[index] ?? 0;
    const align = columns[index]?.align ?? "left";
    const leadingPadding = " ".repeat(padding);
    const trailingPadding = " ".repeat(padding);
    return `${leadingPadding}${alignCell(cell, width, align)}${trailingPadding}`;
  });
  return `|${rendered.join("|")}|`;
}

function alignCell(value: string, width: number, align: TableAlignment): string {
  if (value.length >= width) {
    return value;
  }

  const fill = " ".repeat(width - value.length);
  return align === "right" ? `${fill}${value}` : `${value}${fill}`;
}

function sanitizeCell(value: string): string {
  return value.replace(/\r?\n/g, " ").trim();
}
