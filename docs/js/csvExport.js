// # 保存ボタン
export const headers = ["ジャンル", "カテゴリ", "質問", "質問の答え", "深堀1", "深堀1の答え", 
    "深堀2", "深堀2の答え", "深堀3", "深堀3の答え"];

export function exportToCSV(data) {
  const rows = data.map(row => headers.map(h => `"${(row[h] || "").replace(/"/g, '""')}"`).join(","));
  const csv = [headers.join(","), ...rows].join("\n");

  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv; charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "interview_log.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// # csv形式で保存
export function formatEntry(entry) {
  const formatted = {
    ジャンル: entry["ジャンル"],
    カテゴリ: entry["カテゴリ"],
    質問: entry["質問"],
    質問の答え: entry["質問の答え"] || entry.answer || ""
  };

  const followups = entry.followups || [];
  const answers = entry.followupAnswers || {};

  for (let i = 0; i < 3; i++) {
    const fText = followups[i] || "";
    const aText = answers && fText ? answers[fText] ?? "" : "";
    formatted[`深堀${i + 1}`] = fText;
    formatted[`深堀${i + 1}の答え`] = aText;
  }

  return formatted;
}

