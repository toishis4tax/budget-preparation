// Excel出力

function exportExcel(budget) {
  if (!budget) { alert('予算データがありません'); return; }
  if (typeof XLSX === 'undefined') {
    alert('Excel出力にはSheetJSが必要です。ページを再読み込みしてください。');
    return;
  }

  const company  = window.App?.currentCompany;
  const compName = company?.name || '会社名未設定';
  const isDynamic = !!budget.dynamicAccounts?.length;

  // 月ラベル（開始月ベース）
  const startM = budget.startMonth || 4;
  const monthLabels = Array.from({length: 12}, (_, i) => {
    const m = ((startM - 1 + i) % 12) + 1;
    return `${m}月`;
  });

  const allVals = isDynamic ? calcAllValuesDynamic(budget) : calcAllValues(budget.rows);
  const remarks = budget.remarks || {};

  const wb = XLSX.utils.book_new();

  // ─── シート生成ヘルパー ───
  function makeSheet(accounts) {
    const header = ['科目名', ...monthLabels, '調整', '合計', '摘要'];
    const rows   = [header];

    accounts.forEach(acc => {
      if (acc.type === 'separator') { rows.push([]); return; }
      const raw   = allVals[acc.id] || new Array(13).fill(0);
      const vals  = raw.slice(0, 12);
      const adj   = raw[12] ?? 0;
      const total = vals.reduce((a, b) => a + (b || 0), 0) + adj;
      const indent = '　'.repeat(acc.indent || 0);
      rows.push([
        indent + (acc.name || ''),
        ...vals.map(v => v ? Math.round(v) : 0),
        adj ? Math.round(adj) : 0,
        Math.round(total),
        remarks[acc.id] || '',
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);

    // 列幅設定
    ws['!cols'] = [
      { wch: 30 },                              // 科目名
      ...Array(12).fill({ wch: 10 }),           // 各月
      { wch: 8  },                              // 調整
      { wch: 11 },                              // 合計
      { wch: 24 },                              // 摘要
    ];

    // ヘッダー行スタイル
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = XLSX.utils.encode_cell({ r: 0, c });
      if (!ws[cell]) continue;
      ws[cell].s = {
        fill: { patternType: 'solid', fgColor: { rgb: '1E40AF' } },
        font: { color: { rgb: 'FFFFFF' }, bold: true, sz: 10 },
        alignment: { horizontal: 'center' },
      };
    }

    return ws;
  }

  // ─── PL シート ───
  if (isDynamic) {
    const plAccounts = budget.dynamicAccounts.filter(a =>
      a.section === 'pl' || a.section == null
    );
    if (plAccounts.length) {
      wb.SheetNames.push('月次予算（PL）');
      wb.Sheets['月次予算（PL）'] = makeSheet(plAccounts);
    }

    const bsAccounts = budget.dynamicAccounts.filter(a =>
      a.section?.startsWith('bs')
    );
    if (bsAccounts.length) {
      wb.SheetNames.push('月次予算（BS）');
      wb.Sheets['月次予算（BS）'] = makeSheet(bsAccounts);
    }
  } else {
    const plAccounts = ACCOUNTS.filter(a =>
      a.section === 'pl' || a.section?.startsWith('pl') || a.section === 'sep'
    );
    const bsAccounts = ACCOUNTS.filter(a =>
      ['bs_asset', 'bs_liab', 'bs_equity'].includes(a.section)
    );
    if (plAccounts.length) {
      wb.SheetNames.push('月次予算（PL）');
      wb.Sheets['月次予算（PL）'] = makeSheet(plAccounts);
    }
    if (bsAccounts.length) {
      wb.SheetNames.push('月次予算（BS）');
      wb.Sheets['月次予算（BS）'] = makeSheet(bsAccounts);
    }
  }

  if (!wb.SheetNames.length) {
    alert('出力できる科目データがありません');
    return;
  }

  XLSX.writeFile(wb, `月次予算_${compName}_${budget.year || '不明'}年度.xlsx`);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href    = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 100);
}
