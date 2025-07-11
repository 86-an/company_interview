// # CSVを読み込んでパースする
async function loadCSV() {
    const res = await fetch("../data/company_interview_data.txt");
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
function getUnique(records, key) {
    return [...new Set(records.map(r => r[key]))];
}

// # チェックボックスを生成
function createCheckboxes(containerId, values, name) {
    const container = document.getElementById(containerId);
    container.innerHTML = "";
    values.forEach(val => {
    const cleanVal = val.trim();
    const id = `${name}-${cleanVal}`;
    const label = document.createElement("label");
    label.innerHTML = `<input type="checkbox" name="${name}" value="${cleanVal}" id="${id}"> ${cleanVal}`;
    container.appendChild(label);
    });
}

// # 選択されたチェックボックスの値を取得
function getCheckedValues(name) {
    return [...document.querySelectorAll(`input[name="${name}"]:checked`)].map(cb => cb.value);
}

// # 質問をフィルタしてランダムに並べる
function filterQuestions(records, selectedGenres, selectedCategories) {
    return records.filter(r =>
    selectedGenres.includes(r["ジャンル"]) &&
    selectedCategories.includes(r["カテゴリ"])
    );
}

function shuffleArray(array) {
    return array.sort(() => Math.random() - 0.5);
}

// # グローバル変数
let records = [];
let filteredQuestions = [];
let currentIndex = 0;
let currentPhase ="main";
let currentQuestion = null;
let currentFollowupIndex = 0;
let responseLog = []

// # 質問と深掘りを表示
function displayQuestion(q) {
  currentQuestion = q; 
  currentQuestion.currentFollowup = null;
  currentQuestion.answer = "";
  currentQuestion.followupAnswers = {};
  currentQuestion.followups = [q["深堀１"], q["深堀２"], q["深堀３"]].filter(Boolean);
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

    setupRecognition();
    console.log("recognitionオブジェクトが初期化されました", recognition)
    });

document.getElementById("show-followup").addEventListener("click", () => {
  const followups = currentQuestion.followups;
  const nextF = followups[Math.floor(Math.random() * followups.length)];
  currentQuestion.currentFollowup = nextF; // ✅ 一時的に保存しておく

  document.getElementById("main-question").textContent = `🔍 ${nextF}`;
});

document.getElementById("next-question").addEventListener("click", () => {
  // 保存処理
  responseLog.push({
    ジャンル: currentQuestion["ジャンル"],
    カテゴリ: currentQuestion["カテゴリ"],
    質問: currentQuestion["質問"],
    質問の答え: currentQuestion.answer || "",
    深堀: currentQuestion.currentFollowup || "",
    深堀の答え: currentQuestion.followupAnswers?.[currentQuestion.currentFollowup] || ""
  });

  // 質問切り替え
  currentIndex++;
  currentQuestion = null;
  if (currentIndex < filteredQuestions.length) {
    currentQuestion = filteredQuestions[currentIndex];
    displayQuestion(currentQuestion);
  } else {
    document.getElementById("main-question").textContent = "🎉 すべての質問が終了しました";
  }
});

let recognition;
let finalTranscript = "";

function setupRecognition() {
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) {
    alert("このブラウザは音声認識に対応していません。");
    return;
  }

  recognition = new SpeechRec();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "ja-JP";

  recognition.onresult = (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      const res = event.results[i];
      const txt = res[0].transcript;
      if (res.isFinal) {
        finalTranscript += txt;

      if (currentQuestion) {
        if (currentPhase === "main") {
          currentQuestion.answer = txt;
        } else if (currentPhase === "followup" && currentQuestion.currentFollowup) {
          if (!currentQuestion.followupAnswers) currentQuestion.followupAnswers = {};
          currentQuestion.followupAnswers[currentQuestion.currentFollowup] = txt;
        }
      }
      } else {
        interim += txt;
      }
    }
    document.getElementById("transcript").textContent = finalTranscript + interim;
  };

  recognition.onstart = () => {
    document.getElementById("status").textContent = "ステータス：認識中…";
  };

  recognition.onend = () => {
    document.getElementById("status").textContent = "ステータス：停止中";
  };

  recognition.onerror = (e) => {
    document.getElementById("status").textContent = `エラー：${e.error}`;
  };
}

// ✅ setupRecognition の外に定義する
function startRecognition() {
  console.log("startRecognitionが呼び出されました！");
  if (!recognition) {
    alert("音声認識が初期化されていません。");
    return;
  }
  finalTranscript = "";
  document.getElementById("transcript").textContent = "";
  recognition.start();
  document.getElementById("start-btn").disabled = true;
  document.getElementById("stop-btn").disabled = false;
}

function stopRecognition() {
  if (!recognition) return;
  recognition.stop();
  document.getElementById("start-btn").disabled = false;
  document.getElementById("stop-btn").disabled = true;
}

document.getElementById("start-btn").addEventListener("click", startRecognition);
document.getElementById("stop-btn").addEventListener("click", stopRecognition);

function exportToCSV(data) {
  const headers = ["ジャンル", "カテゴリ", "質問", "質問の答え", "深堀", "深堀の答え"];
  const rows = data.map(row => headers.map(h => `"${(row[h] || "").replace(/"/g, '""')}"`).join(","));
  const csv = [headers.join(","), ...rows].join("\n");

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "interview_log.csv";
  a.click();
  URL.revokeObjectURL(url);
}

document.getElementById("save-csv").addEventListener("click", () => {
  const headers = ["ジャンル", "カテゴリ", "質問", "質問の答え", "深堀", "深堀の答え"];
  const rows = [];

  // 1. 過去の質問と回答
  responseLog.forEach(entry => {
    rows.push(headers.map(h => `"${(entry[h] || "").replace(/"/g, '""')}"`).join(","));
  });

  // 2. 現在の質問と回答（まだ responseLog に入っていない）
  if (currentQuestion) {
    const currentEntry = {
      ジャンル: currentQuestion["ジャンル"],
      カテゴリ: currentQuestion["カテゴリ"],
      質問: currentQuestion["質問"],
      質問の答え: currentQuestion.answer || "",
      深堀: currentQuestion.followups?.join(" / ") || "",
      深堀の答え: Object.values(currentQuestion.followupAnswers || {}).join(" / ")
    };
    rows.push(headers.map(h => `"${(currentEntry[h] || "").replace(/"/g, '""')}"`).join(","));
  }

  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "interview_log.csv";
  a.click();
  URL.revokeObjectURL(url);
});