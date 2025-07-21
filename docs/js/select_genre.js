import { loadCSV, getUnique, shuffleArray ,filterQuestions } from "./dataLoader.js";
import {createCheckboxes, getCheckedValues} from "./uniUtils.js";
import { setuprecogState, startrecogState, stoprecogState} from "./speechRecognition.js";
import { exportToCSV, formatEntry, headers } from "./csvExport.js";

// # グローバル変数
let records = [];
let filteredQuestions = [];
let currentIndex = 0;
let currentFollowupIndex = 0;
let responseLog = []

// #音声用
let recogState = {
  currentPhase: "main",
  mainTranscript: "",
  followupTranscript: "",
  currentQuestion: null,
  recognition: null
};

// # 質問と深掘りを表示
function displayQuestion(q) {
  recogState.currentQuestion = q; 
  recogState.currentQuestion.currentFollowup = null;
  recogState.currentQuestion.answer = "";
  recogState.currentQuestion.followupAnswers = {};
  recogState.currentQuestion.followups = [q["深堀１"], q["深堀２"], q["深堀３"]].filter(Boolean);
  document.getElementById("main-question").textContent = `🗣 ${q["質問"]}`;
}

// # 初期化処理
document.addEventListener("DOMContentLoaded", async () => {
    records = await loadCSV();
    console.log("ヘッダー:", Object.keys(records[0]));
    console.log("読み込んだレコード:", records);
    const genres = getUnique(records, "ジャンル");
    const categories = getUnique(records, "カテゴリ");

    createCheckboxes("genre-boxes", genres, "genre");
    createCheckboxes("category-boxes", categories, "category");

// 「選択表示」ボタンの処理
document.getElementById("show-selection").addEventListener("click", () => {
  recogState.mainTranscript = "";
  recogState.followupTranscript = "";
  recogState.currentPhase = "main"
console.group("▶ show-selection");

// 1) チェック済みジャンル・カテゴリの取得
const selectedGenres   = getCheckedValues("genre");
const selectedCategories = getCheckedValues("category");
console.log("1) selectedGenres:",   selectedGenres);
console.log("2) selectedCategories:", selectedCategories);

// 2) フィルタ前／後のレコード数を比較
console.log("3) before filter, records.length:", records.length);
const filtered = filterQuestions(records, selectedGenres, selectedCategories);
console.log("4) filtered (unshuffled).length:", filtered.length);

// 3) シャッフル結果
filteredQuestions = shuffleArray(filtered);
console.log("5) filteredQuestions (shuffled).length:", filteredQuestions.length);
console.log("6) first few questions:", filteredQuestions.slice(0,3));

// 4) インデックス・表示
currentIndex = 0;
if (filteredQuestions.length > 0) {
    console.log("7) displaying index:", currentIndex);
    displayQuestion(filteredQuestions[currentIndex]);
} else {
    console.warn("⚠️ フィルタ結果 0 件!");
    document.getElementById("main-question").textContent = "⚠️ 該当する質問がありません";
    document.getElementById("followups").innerHTML = "";
}

console.groupEnd()});

recogState = setuprecogState(recogState);
console.log("recogState.recognitionオブジェクトが初期化されました", recogState.recognition)
});


document.getElementById("show-followup").addEventListener("click", () => {
  if (recogState.mainTranscript && recogState.currentQuestion) {
    recogState.currentQuestion.answer = recogState.mainTranscript; // メインの回答保存
  }

  recogState.mainTranscript = "";
  recogState.followupTranscript = "";
  recogState.currentPhase = "followup";

  const followups = recogState.currentQuestion.followups;
  const nextF = followups[Math.floor(Math.random() * followups.length)];
  recogState.currentQuestion.currentFollowup = nextF;
  document.getElementById("main-question").textContent = `🗣 (深堀) ${nextF}`;
  // # 音声認識をスタート
  recogState = startrecogState(recogState);
});

document.getElementById("next-question").addEventListener("click", () => {
  // 質問の回答保存（main）
  if (recogState.mainTranscript && recogState.currentQuestion) {
    recogState.currentQuestion.answer = recogState.mainTranscript;
  }

  // 深堀の最終保存（最後の currentFollowup がある場合）
  if (
    recogState.followupTranscript &&
    recogState.currentQuestion?.currentFollowup
  ) {
    recogState.currentQuestion.followupAnswers[recogState.currentQuestion.currentFollowup] =
      recogState.followupTranscript;
  }

  const savedMain = recogState.mainTranscript || "";
  const savedFollowupAnswers = { ...recogState.currentQuestion.followupAnswers };
  const savedFollowupList = [...recogState.currentQuestion.followups];

  // 回答をログに追加
responseLog.push({
  ジャンル: recogState.currentQuestion["ジャンル"],
  カテゴリ: recogState.currentQuestion["カテゴリ"],
  質問: recogState.currentQuestion["質問"],
  質問の答え: recogState.currentQuestion.answer || savedMain,
  followups: savedFollowupList,
  followupAnswers: savedFollowupAnswers
});

  // 状態リセット＆次へ
  recogState.mainTranscript = "";
  recogState.followupTranscript = "";
  recogState.currentPhase = "main";
  recogState.currentFollowupIndex = 0;
  recogState.currentQuestion.currentFollowup = null;

  currentIndex++;
  if (currentIndex < filteredQuestions.length) {
    recogState.currentQuestion = filteredQuestions[currentIndex];
    displayQuestion(recogState.currentQuestion);
  } else {
    document.getElementById("main-question").textContent =
      "🎉 すべての質問が終了しました";
    recogState.currentQuestion = null;
  }

  console.table(recogState.currentQuestion.followupAnswers);
  console.log("📌 currentFollowup:", recogState.currentQuestion.currentFollowup);
  console.log("📝 followupTranscript:", recogState.followupTranscript);
  console.log(responseLog);
  console.log("🗣 最新質問の答え:", recogState.currentQuestion?.answer);
  console.group("▶ next-question")
});



// #停止ボタン
document.getElementById("stop-btn").addEventListener("click", () => {
  recogState  = stoprecogState(recogState);
});

document.getElementById("save-csv").addEventListener("click", () => {
  if (recogState.currentQuestion && recogState.mainTranscript) {
    recogState.currentQuestion.answer = recogState.mainTranscript;
  }
  const rows = [];
  console.log("🔍 currentFollowups:", recogState.currentQuestion.followups);
  console.log("📝 followupAnswers:", recogState.currentQuestion.followupAnswers);

  // 1. 過去の質問と回答
  responseLog.forEach(entry => {
    rows.push(formatEntry(entry));
  });

  // 2. 現在の質問と回答（まだ responseLog に入っていない）
  if (recogState.currentQuestion) {
    const currentEntry = {
      ジャンル: recogState.currentQuestion["ジャンル"],
      カテゴリ: recogState.currentQuestion["カテゴリ"],
      質問: recogState.currentQuestion["質問"],
      質問の答え: recogState.currentQuestion.answer || "",
      followups: recogState.currentQuestion.followups,
      followupAnswers: recogState.currentQuestion.followupAnswers
    };
    rows.push(formatEntry(currentEntry))
    console.log(rows)
  }

  exportToCSV(rows);
});