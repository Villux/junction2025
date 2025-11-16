import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import { useEffect, useState } from "react";

type HistoryItem = {
  timestamp: number;
  transcript: string;
};

export const startTriggerWords = [
  "okay camera",
  "hey camera",
  "ok camera",
  "okey camera",
];

export function useAudioTranscription() {
  const [recognizing, setRecognizing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [transcriptHistory, setTranscriptHistory] = useState<HistoryItem[]>([]);

  async function handleStart() {
    const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();

    if (!result.granted) {
      console.warn("Permissions not granted", result);
      return;
    }

    ExpoSpeechRecognitionModule.start({
      lang: "en-US",
      interimResults: true,
      continuous: true,
    });
  }

  useSpeechRecognitionEvent("start", () => {
    setRecognizing(true);
  });

  useSpeechRecognitionEvent("end", () => {
    setRecognizing(false);

    // Automatically restart recognition to keep it continuous
    setTimeout(() => {
      handleStart().catch((error) => {
        console.error("Failed to restart speech recognition:", error);
        // Retry after a delay
        setTimeout(() => handleStart(), 2000);
      });
    }, 100);
  });

  useSpeechRecognitionEvent("result", (event) => {
    const result = event.results[0];
    const currentTranscript = (result.transcript || "").trim();
    const isFinal = event.isFinal;

    setTranscript(currentTranscript);

    if (currentTranscript) {
      const normalizedTranscript = currentTranscript.toLowerCase();

      // Check for start trigger word
      if (
        !isRecording &&
        startTriggerWords.some((word) => normalizedTranscript.includes(word))
      ) {
        console.log("Start trigger detected, beginning recording...");
        setIsRecording(true);

        if (isFinal) {
          setTranscriptHistory([
            { timestamp: Date.now(), transcript: currentTranscript },
          ]);
        } else {
          setTranscriptHistory([]);
        }
      }

      // Only store transcripts if we're actively recording
      if (isRecording) {
        if (isFinal) {
          console.log("Updating history:", currentTranscript);
          setTranscriptHistory((prev) => [
            ...prev,
            { timestamp: Date.now(), transcript: currentTranscript },
          ]);
        }
      }
    }
  });

  useSpeechRecognitionEvent("error", (event) => {
    console.log("error code:", event.error, "error message:", event.message);

    // Attempt to restart recognition after an error
    setTimeout(() => {
      if (!recognizing) {
        handleStart().catch((retryError) => {
          console.error("Failed to restart after error:", retryError);
        });
      }
    }, 1000);
  });

  useEffect(() => {
    console.log("Transcript updated:", transcript);
    console.log(
      "Transcript history:",
      transcriptHistory.map((item) => item.transcript).join(" / ")
    );
  }, [transcriptHistory]);

  return {
    recognizing,
    transcript,
    isRecording,
    history: transcriptHistory,
    start: handleStart,
  };
}
