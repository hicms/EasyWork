// Shared Host extraction; preview and Library use the same CSV parser and ExcelJS runtime.
import { decodeCsvBytes, parseCsv, csvLimits } from './csv/csv.ts';
const escape = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\|/g, '&#124;').replace(/\r?\n/g, '<br>');
const tableMarkdown = rows => {
  if (!rows.length) return '';
  const width = Math.max(1, ...rows.map(row => row.length));
  const lines = rows.map(row => `| ${Array.from({ length: width }, (_, i) => escape(row[i])).join(' | ')} |`);
  lines.splice(1, 0, `| ${Array(width).fill('---').join(' | ')} |`);
  return lines.join('\n');
};
export async function extractTabularText(kind, bytes, signal) {
  signal?.throwIfAborted();
  if (kind === 'csv') {
    const decoded = decodeCsvBytes(bytes);
    if (decoded.binary) throw new Error('library/invalid-csv');
    const table = parseCsv(decoded.text);
    return { markdown: tableMarkdown(table.header.length ? [table.header, ...table.rows] : []) + '\n', warnings: table.truncatedRows || table.truncatedColumns ? ['CSV 检索文本仅包含前缀：最多 1500 行、120 列、24000 单元格；完整原件已保留。'] : [] };
  }
  const { default: ExcelJS } = await import('exceljs');
  signal?.throwIfAborted();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes);
  signal?.throwIfAborted();
  const sections = [], warnings = ['公式不重新计算，仅提取已有缓存结果；图表、图片和格式不进入检索文本。'];
  let cells = 0, sheetCount = 0, truncated = false;
  workbook.eachSheet(sheet => {
    signal?.throwIfAborted();
    if (++sheetCount > 20 || cells >= csvLimits.cells) { truncated = true; return; }
    const width = Math.min(csvLimits.columns, sheet.columnCount);
    const count = Math.min(csvLimits.rows, sheet.rowCount, Math.floor((csvLimits.cells - cells) / Math.max(1, width)));
    if (width < sheet.columnCount || count < sheet.rowCount) truncated = true;
    const rows = [];
    for (let r = 1; r <= count; r++) {
      signal?.throwIfAborted();
      const row = [];
      for (let c = 1; c <= width; c++) {
        const cell = sheet.getCell(r, c);
        row.push(cell.text); cells++;
      }
      rows.push(row);
    }
    sections.push(`## ${escape(sheet.name)}\n\n${tableMarkdown(rows)}`);
  });
  if (truncated) warnings.push('XLSX 检索文本仅包含前缀：最多 20 个工作表、每表 1500 行/120 列、总计 24000 单元格；完整原件已保留。');
  return { markdown: sections.join('\n\n') + '\n', warnings };
}
