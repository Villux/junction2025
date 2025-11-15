import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import { useRef, useState } from "react";

type HistoryItem = {
  timestamp: number;
  transcript: string;
};

export function useAudioTranscription() {
  const [recognizing, setRecognizing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [capturedText, setCapturedText] = useState("");
  const fullTranscriptRef = useRef<string>("");
  const transcriptHistory = useRef<HistoryItem[]>([]);
  const autoClearTimeout = useRef<number | undefined>(undefined);

  // Auto-clear captured sentences after 30 seconds
  // useEffect(() => {
  //   if (capturedText) {
  //     autoClearTimeout.current = setTimeout(() => {
  //       setCapturedText("");
  //     }, 30000);
  //   }

  //   return () => {
  //     if (autoClearTimeout.current) {
  //       clearTimeout(autoClearTimeout.current);
  //     }
  //   };
  // }, [capturedText]);

  useSpeechRecognitionEvent("start", () => {
    setRecognizing(true);
  });

  useSpeechRecognitionEvent("end", () => {
    setRecognizing(false);
  });

  useSpeechRecognitionEvent("result", (event) => {
    const currentTranscript = (event.results[0]?.transcript || "").trim();
    const isFinal = event.isFinal;

    setTranscript(currentTranscript);

    // Update full transcript and history
    if (currentTranscript) {
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

      // Pick the last 3 sentences (within 20sec window) before the trigger phrase
      const now = Date.now();

      transcriptHistory.current = transcriptHistory.current.filter(
        (item) => now - item.timestamp <= 20000
      );

      const transcriptsInWindow = transcriptHistory.current
        .map((item) => item.transcript)
        .slice(-3)
        .join(" ")
        .toLowerCase()
        .trim();

      // Check for trigger phrase "one, two, three"
      if (
        transcriptsInWindow.includes("one two three") ||
        transcriptsInWindow.includes("one, two, three") ||
        transcriptsInWindow.includes("1 2 3") ||
        transcriptsInWindow.includes("123")
      ) {
        if (transcriptsInWindow.length > 0) {
          // Remove "one, two, three" from the end if it got included
          const text = transcriptsInWindow
            .replace(/one,? two,? three|1 2 3|123$/i, "")
            .trim();

          setCapturedText(text);
          setTranscript("");
          transcriptHistory.current = [];
          fullTranscriptRef.current = "";
        }
      }
    }
  });

  useSpeechRecognitionEvent("error", (event) => {
    console.log("error code:", event.error, "error message:", event.message);
  });

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
      // Android-specific options to increase silence timeout
      androidIntentOptions: {
        EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 10000,
      },
    });
  }

  return {
    recognizing,
    transcript,
    capturedText,
    start: handleStart,
    stop: () => ExpoSpeechRecognitionModule.stop(),
    clearCaptured: () => {
      if (autoClearTimeout.current) clearTimeout(autoClearTimeout.current);
      setCapturedText("");
    },
  };
}
