// CSV・Excel出力

function exportCSV(budget) {
  if (!budget) { alert('予算データがありません'); return; }
  const allVals = calcAllValues(budget.rows);
  const months = ['4月','5月','6月','7月','8月','9月','10月','11月','12月','1月','2月','3月'];

  const header = ['科目', ...months, '合計'];
  const lines = [header.join(',')];

  ACCOUNTS.forEach(acc => {
    if (acc.type === 'separator') return;
    const vals = allVals[acc.id] || new Array(12).fill(0);
    const total = vals.reduce((a,b)=>a+b,0);
    const row = [
      `"${'　'.repeat(acc.indent)}${acc.name}"`,
      ...vals.map(v => Math.round(v)),
      Math.round(total)
    ];
    lines.push(row.join(','));
  });

  const bom = '﻿';
  const blob = new Blob([bom + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `予算_${budget.year}年度.csv`);
}

function exportExcel(budget) {
  if (!budget) { alert('予算データがありません'); return; }
  if (typeof XLSX === 'undefined') {
    alert('Excel出力にはSheetJSが必要です。ページを再読み込みしてください。');
    return;
  }

  const allVals = calcAllValues(budget.rows);
  const months = ['4月','5月','6月','7月','8月','9月','10月','11月','12月','1月','2月','3月'];
  const wb = XLSX.utils.book_new();

  // PL シート
  const plData = [['科目', ...months, '合計']];
  ACCOUNTS.filter(a => ['pl','sep'].includes(a.section) || a.section?.startsWith('pl')).forEach(acc => {
    if (acc.type === 'separator') { plData.push([]); return; }
    const vals = allVals[acc.id] || new Array(12).fill(0);
    const total = vals.reduce((a,b)=>a+b,0);
    plData.push(['　'.repeat(acc.indent) + acc.name, ...vals.map(Math.round), Math.round(total)]);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(plData), '月次予算（PL）');

  // BS シート
  const bsData = [['科目', ...months, '合計']];
  ACCOUNTS.filter(a => ['bs_asset','bs_liab','bs_equity'].includes(a.section)).forEach(acc => {
    const vals = allVals[acc.id] || new Array(12).fill(0);
    const total = vals.reduce((a,b)=>a+b,0);
    bsData.push(['　'.repeat(acc.indent) + acc.name, ...vals.map(Math.round), Math.round(total)]);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(bsData), '月次予算（BS）');

  XLSX.writeFile(wb, `予算_${budget.year}年度.xlsx`);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// 印刷
function printBudget() {
  window.print();
}
