import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import { useEffect, useRef, useState } from "react";

type HistoryItem = {
  timestamp: number;
  transcript: string;
};

const startTriggerWord = "camera";

export function useAudioTranscription() {
  const [recognizing, setRecognizing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [capturedText, setCapturedText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const fullTranscriptRef = useRef<string>("");
  const transcriptHistory = useRef<HistoryItem[]>([]);

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

    // Update full transcript and history
    if (currentTranscript) {
      const normalizedTranscript = currentTranscript.toLowerCase();

      // Check for start trigger word
      if (!isRecording && normalizedTranscript.includes(startTriggerWord)) {
        setIsRecording(true);
        // Clear any previous history when starting new recording
        transcriptHistory.current = [];
        fullTranscriptRef.current = "";
        return;
      }

      // Only store transcripts if we're actively recording
      if (isRecording) {
        if (isFinal) {
          transcriptHistory.current.push({
            timestamp: Date.now(),
            transcript: currentTranscript,
          });
        }

        // Only store the last 10 entries
        if (transcriptHistory.current.length > 10) {
          transcriptHistory.current.shift();
        }

        fullTranscriptRef.current = currentTranscript;

        const transcriptsInWindow = transcriptHistory.current
          .map((item) => item.transcript)
          .join(" ")
          .toLowerCase()
          .trim();

        // Check for end trigger phrase "one, two, three"
        if (
          transcriptsInWindow.includes("one two three") ||
          transcriptsInWindow.includes("one, two, three") ||
          transcriptsInWindow.includes("1 2 3") ||
          transcriptsInWindow.includes("123")
        ) {
          if (transcriptsInWindow.length > 0) {
            // Remove trigger words from the captured text
            const text = `${transcriptsInWindow
              .replace(new RegExp(startTriggerWord, "gi"), "")
              .replace(/one,? two,? three|1 2 3|123$/i, "")
              .trim()}`;

            setCapturedText(text);
            setTranscript("");
            setIsRecording(false);

            transcriptHistory.current = [];
            fullTranscriptRef.current = "";
          }
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
  }, [transcript]);

  return {
    recognizing,
    transcript,
    capturedText,
    isRecording,
    start: handleStart,
    reset: () => {
      transcriptHistory.current = [];
      fullTranscriptRef.current = "";
      setCapturedText("");
      setTranscript("");
      setIsRecording(false);
    },
  };
}
