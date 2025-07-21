import { loadCSV, getUnique, filterQuestions, renderTable} from "./dataLoader.js";
import {createCheckboxes, getCheckedValues} from "./uniUtils.js";
import { exportToCSV } from "./csvExport.js";

let records = [];
document.addEventListener("DOMContentLoaded", async () => {
    try {
    const res = await fetch("../data/company_interview_data.csv");
    const text = await res.text();

    const blob = new Blob(["\uFEFF" + text], {
      type: "text/csv;charset=utf-8;"
    });

    const url = URL.createObjectURL(blob);
    const link = document.getElementById("csv-link");
    link.href = url;
    link.download = "company_interview.csv";
  } catch (err) {
    console.error("ファイルの読み込みに失敗:", err);
  }

  records = await loadCSV();
  renderTable(records);

  console.log("ヘッダー:", Object.keys(records[0]));
  console.log("読み込んだレコード:", records);
  const genres = getUnique(records, "ジャンル");
  const categories = getUnique(records, "カテゴリ");

  createCheckboxes("genre-boxes", genres, "genre");
  createCheckboxes("category-boxes", categories, "category");
  console.log("読み込んだジャンル", genres)
  console.log("読み込んだカテゴリ", categories)
  console.groupEnd();
});

document.getElementById("show-selection").addEventListener("click", () => {
  const selectedGenres = getCheckedValues("genre");
  const selectedCategories = getCheckedValues("category");
  const filtered = filterQuestions(records, selectedGenres, selectedCategories);

  renderTable(filtered);

  console.log("選択後の表示件数：", filtered,length);
});

