
// # 音声認識と文字起こし
export function setuprecogState(recogState) {
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) {
    alert("このブラウザは音声認識に対応していません。");
    return recogState;
  }

  recogState.recognition = new SpeechRec();
  recogState.recognition.continuous = true;
  recogState.recognition.interimResults = true;
  recogState.recognition.lang = "ja-JP";

  recogState.recognition.onresult = (event) => {
    console.log("currentrecogState.currentPhase:", recogState.currentPhase)
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      const res = event.results[i];
      const txt = res[0].transcript;
    
      if (res.isFinal) {
        if (recogState.currentPhase === "main") {
          recogState.mainTranscript += txt;
          if (recogState.currentQuestion) recogState.currentQuestion.answer = recogState.mainTranscript;
        } else if (recogState.currentPhase === "followup") {
          recogState.followupTranscript += txt;
          if (recogState.currentQuestion?.currentFollowup) {
            if (!recogState.currentQuestion.followupAnswers) recogState.currentQuestion.followupAnswers = {};
            recogState.currentQuestion.followupAnswers[recogState.currentQuestion.currentFollowup] = recogState.followupTranscript;
          }
        }
      } else {
        interim += txt;
      }
    }
    console.log("🎯 フェーズ:", recogState.currentPhase);
    console.log("🗣 followupTranscript:", recogState.followupTranscript);
    console.log("📌 currentFollowup:", recogState.currentQuestion.currentFollowup);
    console.log("📝 followupAnswers:", recogState.currentQuestion.followupAnswers);

    document.getElementById("transcript").textContent =
      (recogState.currentPhase === "main" ? recogState.mainTranscript : recogState.followupTranscript) + interim;
  };

  recogState.recognition.onstart = () => {
    document.getElementById("status").textContent = "ステータス：認識中…";
  };

  recogState.recognition.onend = () => {
    document.getElementById("status").textContent = "ステータス：停止中";
  };

  recogState.recognition.onerror = (e) => {
    document.getElementById("status").textContent = `エラー：${e.error}`;
  };
  return recogState
}

// ✅ setuprecogState.recognition の外に定義する
export function startrecogState(recogState) {
  console.log("startrecogState.recognitionが呼び出されました！ recogState.currentPhase =", recogState.currentPhase);
  if (!recogState.recognition) {
    alert("音声認識が初期化されていません。");
    return recogState;
  }
  recogState.mainTranscript = "";
  recogState.followupTranscript = "";
  document.getElementById("transcript").textContent = "";
  recogState.recognition.start();
  document.getElementById("start-btn").disabled = true;
  document.getElementById("stop-btn").disabled = false;
  return recogState
}

export function stoprecogState(recogState) {
  if (!recogState.recognition) 
    return recogState;
  recogState.recognition.stop();
  document.getElementById("start-btn").disabled = false;
  document.getElementById("stop-btn").disabled = true;
  return recogState
}