// # CSVを読み込んでパースする
export async function loadCSV() {
    const res = await fetch("../data/company_interview_data.csv");
    const text = await res.text();
    const lines = text.trim().split("\n");
    const headers = lines[0].split(",").map(h => h.trim());
    const records = lines.slice(1).map(line => {
    const values = line.split(",").map(v => v.trim());
    return Object.fromEntries(headers.map((h, i) => [h, values[i]]));
    });
    return records;
}

// # ユニークな値を抽出
export function getUnique(records, key) {
    return [...new Set(records.map(r => r[key]))];
}

// # 質問をフィルタしてランダムに並べる
export function filterQuestions(records, selectedGenres, selectedCategories) {
    return records.filter(r =>
    selectedGenres.includes(r["ジャンル"]) &&
    selectedCategories.includes(r["カテゴリ"])
    );
}

export function shuffleArray(array) {
    return array.sort(() => Math.random() - 0.5);
}

export function renderTable(records) {
    const tbody = document.getElementById("record-table-body");
    tbody.innerHTML ="";

    records.forEach(record => {
        const row = document.createElement("tr");
        row.innerHTML = `
        <td>${record["ジャンル"]}</td>
        <td>${record["カテゴリ"]}</td>
        <td>${record["質問"]}</td>
        <td>${record["深堀１"]}</td>
        <td>${record["深堀２"]}</td>
        <td>${record["深堀３"]}</td>            
        `;
        tbody.appendChild(row);
    });
}