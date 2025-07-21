
import { loadCSV, shuffleArray } from "./dataLoader.js"; // filterQuestionsは不要になるので削除
import { createCheckboxes, getCheckedValues } from "./uniUtils.js"; // createCheckboxesはcreateRadioButtonsと同じロジックを使うため、もしuniUtilsにcreateRadioButtonsがなければ、ここに追加するか、直接記述します。
import { setuprecogState, startrecogState, stoprecogState } from "./speechRecognition.js";
import { exportToCSV, formatEntry, headers } from "./csvExport.js";

// # グローバル変数
let records = []; // 全レコードを保持
let availableQuestions = []; // 現在の面接セッションでまだ出題されていない質問のリスト
let currentIndex = 0;
let currentFollowupIndex = 0;
let responseLog = [];

let totalQuestionsAsked = 0; // 現在のセッションで質問した数
let targetQuestionCount = 0; // 目標とする質問数
let requiredQuestionsAskedCount = 0; // 必須質問を出題した回数
let requiredQuestionsPool = []; // 必須質問のリスト
let currentSessionRequiredQuestions = []; // 現在のセッションで出題すべき必須質問のリスト

// #音声用
let recogState = {
  currentPhase: "main",
  mainTranscript: "",
  followupTranscript: "",
  currentQuestion: null,
  recognition: null
};

// 面接フェーズと面接官タイプごとの質問ジャンルの傾向
const interviewPhaseSettings = {
  "1次面接": {
    totalCount: 5,
    requiredCount: 2,
    "人事": {
      genreEmphasis: {
        "基本情報": 0.5,
        "企業理解": 0.3,
        "スキル": 0.1,
        "その他": 0.1
      },
      // 必要に応じて特定のカテゴリを優先する設定なども追加可能
    },
    "現場": {
      genreEmphasis: {
        "スキル": 0.6,
        "企業理解": 0.2,
        "基本情報": 0.1,
        "その他": 0.1
      }
    }
  },
  "2次面接": {
    totalCount: 8,
    requiredCount: 2,
    "人事": {
      genreEmphasis: {
        "企業理解": 0.4,
        "スキル": 0.3,
        "基本情報": 0.1,
        "その他": 0.2
      }
    },
    "役員": {
      genreEmphasis: {
        "企業理解": 0.5,
        "その他": 0.3,
        "スキル": 0.2
      }
    }
    // ... 必要に応じて他のフェーズの設定を追加
  }
};

const excludedRequiredKeywords = ["何か質問はありますか？"];
// # 質問と深掘りを表示
function displayQuestion(q) {
  recogState.currentQuestion = q;
  recogState.currentQuestion.currentFollowup = null;
  recogState.currentQuestion.answer = "";
  recogState.currentQuestion.followupAnswers = {};
  let show_followups = [q["深堀１"], q["深堀２"], q["深堀３"]].filter(Boolean);
  recogState.currentQuestion.followups = shuffleArray(show_followups)
  document.getElementById("main-question").textContent = `🗣 ${q["質問"]}`;
}

// 新しくラジオボタンを生成するヘルパー関数 (uniUtilsにcreateRadioButtonsがなければここに)
function createRadioButtons(containerId, values, name) {
    const container = document.getElementById(containerId);
    container.innerHTML = "";
    values.forEach(val => {
        const cleanVal = val.trim();
        const id = `${name}-${cleanVal}`;
        const label = document.createElement("label");
        label.innerHTML = `<input type="radio" name="${name}" value="${cleanVal}" id="${id}"> ${cleanVal}`;
        container.appendChild(label);
    });
}

// # 初期化処理
document.addEventListener("DOMContentLoaded", async () => {
  records = await loadCSV(); // 全レコードを一度読み込む
  console.log("ヘッダー:", Object.keys(records[0]));
  console.log("読み込んだレコード:", records);

  // 面接フェーズのラジオボタンを生成
  const phaseValues = Object.keys(interviewPhaseSettings);
  createRadioButtons("interview-phase-boxes", phaseValues, "interview-phase");

  // 面接官タイプのラジオボタンを生成
  let interviewerTypeValues = [];
  // 明示的に除外するキーのリスト
  const excludedKeysForInterviewerType = ['totalCount', 'requiredCount', 'genreEmphasis']; 

  for (const phaseKey in interviewPhaseSettings) {
    for (const subKey in interviewPhaseSettings[phaseKey]) {
      // subKeyが除外リストに含まれていない、かつその値がオブジェクトである場合のみ追加
      if (!excludedKeysForInterviewerType.includes(subKey) && typeof interviewPhaseSettings[phaseKey][subKey] === 'object') {
        interviewerTypeValues.push(subKey);
      }
    }
  }
  interviewerTypeValues = [...new Set(interviewerTypeValues)]; // 重複を排除
  createRadioButtons("interviewer-type-boxes", interviewerTypeValues, "interviewer-type");

  recogState = setuprecogState(recogState);

  // 「対象」ラジオボタンのイベントリスナーを設定
  const targetAudienceRadios = document.querySelectorAll('input[name="target-audience"]');
  targetAudienceRadios.forEach(radio => {
    // このファイルではカテゴリ選択がないため、changeイベントでの処理は不要
    // 必要であれば、ここで「対象」選択に応じた初期化処理などを追加できます
  });

  // 初期表示時に「学生」をデフォルト選択（またはどちらも選択しない）
  const defaultTargetRadio = document.getElementById('target-audience-student');
  if (defaultTargetRadio) {
    defaultTargetRadio.checked = true;
    // updateCategoryCheckboxes() の呼び出しは不要、なぜならカテゴリを動的に表示しないため
  }

  // ジャンルとカテゴリのチェックボックス生成は不要なので削除
  // createCheckboxes("genre-boxes", genres, "genre");
  // createCheckboxes("category-boxes", categories, "category");
});


// 質問選定の新しいロジック
function selectNextQuestion(selectedPhase, selectedInterviewerType, selectedTargetAudience, allRecords) {
  // すでに目標質問数に達しているかチェック
  if (totalQuestionsAsked >= targetQuestionCount) {
    return null; // これ以上質問しない
  }

  // まず、対象（学生/社会人）に基づいてレコードをフィルタリング
  let candidateQuestions = allRecords.filter(r =>
    r["カテゴリ"] === "共通" || r["カテゴリ"] === selectedTargetAudience
  );

  // responseLogにある質問を除外（重複防止）
  const answeredQuestions = new Set(responseLog.map(entry => entry.質問));
  candidateQuestions = candidateQuestions.filter(q => !answeredQuestions.has(q["質問"]));


  const config = interviewPhaseSettings[selectedPhase]?.[selectedInterviewerType];
  const phaseConfig = interviewPhaseSettings[selectedPhase]; // フェーズ全体のコンフィグを取得


  // 必須質問を優先的に選ぶ
  // まだ出題すべき必須質問が残っている場合
  if (requiredQuestionsAskedCount < phaseConfig.requiredCount && currentSessionRequiredQuestions.length > 0) {
    // 未出題の必須質問の中からランダムに選択
    const unansweredRequiredQuestions = currentSessionRequiredQuestions.filter(q => !answeredQuestions.has(q["質問"]));
    if (unansweredRequiredQuestions.length > 0) {
      const selectedRequiredQuestion = shuffleArray(unansweredRequiredQuestions)[0];
      requiredQuestionsAskedCount++; // 必須質問を出題したカウントを増やす
      totalQuestionsAsked++; // 全体質問数を増やす
      return selectedRequiredQuestion;
    }
  }

  // 必須質問をすべて出題済み、または必須質問が見つからない場合
  if (config && candidateQuestions.length > 0) {
    const genreEmphasis = config.genreEmphasis;

    // 必須質問リストに含まれない質問のみを候補とする
    const nonRequiredCandidateQuestions = candidateQuestions.filter(q =>
        !requiredQuestionsPool.some(rq => rq["質問"] === q["質問"])
    );

    // 重み付けに基づいて質問を選択
    const weightedQuestions = [];
    for (const q of nonRequiredCandidateQuestions) { // 必須質問ではない候補から選択
      const genre = q["ジャンル"];
      const weight = genreEmphasis[genre] || 0.01; // 設定されていないジャンルには低い重みを付ける
      for (let i = 0; i < Math.round(weight * 100); i++) { // 比率に応じて複数回追加
        weightedQuestions.push(q);
      }
    }

    if (weightedQuestions.length > 0) {
      // 重み付けされたリストからランダムに選択
      const randomIndex = Math.floor(Math.random() * weightedQuestions.length);
      totalQuestionsAsked++; // 全体質問数を増やす
      return weightedQuestions[randomIndex];
    }
  }

  // 設定がなかったり、重み付けで選べなかった場合は、残りの質問からランダムに選択
  // ここでも必須質問を除外する
  const remainingCandidateQuestions = candidateQuestions.filter(q =>
      !requiredQuestionsPool.some(rq => rq["質問"] === q["質問"])
  );
  if (remainingCandidateQuestions.length > 0) {
    totalQuestionsAsked++; // 全体質問数を増やす
    return shuffleArray(remainingCandidateQuestions)[0];
  }

  return null; // 質問が見つからなかった場合
}


// # 選択してスタートボタン
document.getElementById("show-selection").addEventListener("click", () => {
  console.group("▶ show-selection");

  // ジャンルとカテゴリの選択はここにはないので削除
  const selectedPhase = document.querySelector('input[name="interview-phase"]:checked')?.value;
  const selectedInterviewerType = document.querySelector('input[name="interviewer-type"]:checked')?.value;
  const selectedTargetAudience = document.querySelector('input[name="target-audience"]:checked')?.value;

  if (!selectedPhase || !selectedInterviewerType || !selectedTargetAudience) {
    alert("面接フェーズ、面接官タイプ、対象をすべて選択してください。");
    console.groupEnd();
    return;
  }

  // 面接フェーズに基づいて目標数問題数を設定
  targetQuestionCount = interviewPhaseSettings[selectedPhase]?.totalCount || 0;
  totalQuestionsAsked = 0;
  requiredQuestionsAskedCount = 0;
  responseLog = [];

  // 必須質問プールを初期化
  requiredQuestionsPool = records.filter(r =>
    r["ジャンル"] === "必ず聞かれる" && r["カテゴリ"] == "共通" &&
    !excludedRequiredKeywords.includes(r["質問"])
  );

  //出題対象となる必須質問をシャッフルし、そのセッションで出題する必須質問のリスト
  currentSessionRequiredQuestions = shuffleArray([...requiredQuestionsPool]);
  // 質問選定ロジックを呼び出す
  const firstQuestion = selectNextQuestion(selectedPhase, selectedInterviewerType, selectedTargetAudience, records);
  
  if (firstQuestion) {
    displayQuestion(firstQuestion);
    recogState = startrecogState(recogState); // 音声認識の開始
  } else {
    document.getElementById("main-question").textContent = "選択された条件に合う質問が見つかりませんでした。";
    if (recogState.recognition) {
        recogState = stoprecogState(recogState);
    }
  }
  currentIndex = 0; // 新しい練習開始時はインデックスをリセット
  responseLog = []; // 新しいセッション開始時にログをリセット
  console.groupEnd();
});

// # 深堀するボタン (変更なし)
document.getElementById("show-followup").addEventListener("click", () => {
  if (!recogState.currentQuestion || !recogState.currentQuestion.followups || recogState.currentQuestion.followups.length === 0) {
    alert("深堀できる質問がありません。");
    return;
  }

  if (currentFollowupIndex < recogState.currentQuestion.followups.length) {
    // 現在のメインの質問の答えをログに保存
    if (recogState.currentPhase === "main" && recogState.mainTranscript) {
      recogState.currentQuestion.answer = recogState.mainTranscript;
    }
    
    // 深掘り質問を表示
    recogState.currentQuestion.currentFollowup = recogState.currentQuestion.followups[currentFollowupIndex];
    document.getElementById("main-question").textContent = `🗣 ${recogState.currentQuestion.currentFollowup}`;
    recogState.currentPhase = "followup";
    recogState.followupTranscript = ""; // 深堀の文字起こしをリセット

    currentFollowupIndex++;
  } else {
    alert("すべての深堀質問が終了しました。");
  }
});

// # 次へボタン (変更あり：質問選定ロジックの引数を調整)
document.getElementById("next-question").addEventListener("click", () => {
  console.group("▶ next-question");
  // 現在の質問の回答をログに保存
  if (recogState.currentPhase === "main" && recogState.mainTranscript) {
    recogState.currentQuestion.answer = recogState.mainTranscript;
  } else if (recogState.currentPhase === "followup" && recogState.followupTranscript && recogState.currentQuestion.currentFollowup) {
    if (!recogState.currentQuestion.followupAnswers) recogState.currentQuestion.followupAnswers = {};
    recogState.currentQuestion.followupAnswers[recogState.currentQuestion.currentFollowup] = recogState.followupTranscript;
  }

  // responseLogに現在の質問と回答を追加
  if (recogState.currentQuestion) {
    // 質問と回答が既に responseLog に存在するか確認し、存在しなければ追加
    // 深掘りの回答は currentQuestion オブジェクト内に含まれるため、メイン質問単位で重複チェック
    const existingEntryIndex = responseLog.findIndex(entry => entry.質問 === recogState.currentQuestion.質問);
    if (existingEntryIndex === -1) {
        responseLog.push(recogState.currentQuestion);
    } else {
        // 既存のエントリを更新（例：深掘り回答が追加された場合など）
        responseLog[existingEntryIndex] = recogState.currentQuestion;
    }
  }

  // 次の質問を取得する際にも新しいロジックを使用
  // ジャンルとカテゴリの選択はここにはないので削除
  const selectedPhase = document.querySelector('input[name="interview-phase"]:checked')?.value;
  const selectedInterviewerType = document.querySelector('input[name="interviewer-type"]:checked')?.value;
  const selectedTargetAudience = document.querySelector('input[name="target-audience"]:checked')?.value;


  const nextQuestion = selectNextQuestion(selectedPhase, selectedInterviewerType, selectedTargetAudience, records);

  if (nextQuestion) {
    displayQuestion(nextQuestion);
    recogState.currentPhase = "main"; // メイン質問に戻る
    recogState.mainTranscript = ""; // メインの文字起こしをリセット
    currentFollowupIndex = 0; // 深掘りもリセット
  } else {
    document.getElementById("main-question").textContent = "🎉 すべての質問が終了しました";
    if (recogState.recognition) {
        recogState = stoprecogState(recogState);
    }
  }

  console.log("transcript (main):", recogState.mainTranscript);
  console.log("transcript (followup):", recogState.followupTranscript);
  console.log(responseLog);
  console.log("🗣 最新質問の答え:", recogState.currentQuestion?.answer);
  console.groupEnd();
});


// # 音声認識開始/停止、CSV保存ボタン (変更なし)
document.getElementById("start-btn").addEventListener("click", () => {
  recogState  = startrecogState(recogState);
});
document.getElementById("stop-btn").addEventListener("click", () => {
  recogState  = stoprecogState(recogState);
});

document.getElementById("save-csv").addEventListener("click", () => {
  if (recogState.currentQuestion && recogState.mainTranscript) {
    recogState.currentQuestion.answer = recogState.mainTranscript;
  } else if (recogState.currentQuestion && recogState.currentPhase === "followup" && recogState.currentQuestion.currentFollowup) {
    // 深掘り中の場合も回答を保存
    if (!recogState.currentQuestion.followupAnswers) recogState.currentQuestion.followupAnswers = {};
    recogState.currentQuestion.followupAnswers[recogState.currentQuestion.currentFollowup] = recogState.followupTranscript;
  }

  // responseLogに現在の質問と回答を追加（もしまだ追加されていなければ）
  if (recogState.currentQuestion) {
    const existingEntryIndex = responseLog.findIndex(entry => entry.質問 === recogState.currentQuestion.質問);
    if (existingEntryIndex === -1) {
        responseLog.push(recogState.currentQuestion);
    } else {
        responseLog[existingEntryIndex] = recogState.currentQuestion;
    }
  }

  const rowsToExport = [];
  responseLog.forEach(entry => {
    rowsToExport.push(formatEntry(entry));
  });
  
  exportToCSV(rowsToExport);
});