import { config } from "@/config";
import { sleep } from "@/utils/common";
import { useAudioTranscription } from "@/utils/use-audio-transcription";
import { useInterval } from "@/utils/use-interval";
import { useVolumeChange } from "@/utils/use-volume-change";
import { useAudioPlayer } from "expo-audio";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImageManipulator from "expo-image-manipulator";
import { useEffect, useRef, useState } from "react";
import {
  Button,
  Image,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { VolumeManager } from "react-native-volume-manager";

const audioSource = require("../assets/audio/picture.mp3");
const cameraViewfinderSize = 150;

VolumeManager.showNativeVolumeUI({ enabled: false });

export default function Index() {
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const pictureBlock = useRef(false);
  const cameraRef = useRef<CameraView>(null);
  const player = useAudioPlayer(audioSource);
  const dimensions = useWindowDimensions();
  const transcription = useAudioTranscription();

  // useEffect(() => {
  //   fetch(`${config.API_URL}/images/gcs`, {
  //     headers: { "X-API-Key": config.API_KEY },
  //   }).then(async (response) => {
  //     if (!response.ok) {
  //       console.error("Failed to fetch GCS images:", response.status);
  //       return;
  //     }

  //     const data = await response.json();

  //     console.log(
  //       "Images:",
  //       // Sort by created_at descending
  //       data.items
  //         .slice()
  //         .sort(
  //           (a: any, b: any) =>
  //             new Date(b.created_at).getTime() -
  //             new Date(a.created_at).getTime()
  //         )
  //         .map((item: any) => item.url)
  //     );
  //   });
  // }, []);

  async function cropImage(imageUri: string) {
    try {
      const context = ImageManipulator.ImageManipulator.manipulate(imageUri);

      const image = await context.renderAsync();
      const imageWidth = image.width;
      const imageHeight = image.height;

      // Remove bottom 50%
      context.reset().crop({
        originX: 0,
        originY: 0,
        width: Math.floor(imageWidth * 0.5),
        height: imageHeight,
      });

      // Crop again the remaning to 3:2 aspect ratio
      const croppedWidth = imageHeight * (3 / 2);
      context.reset().crop({
        originX: 0,
        originY: 0,
        width: Math.min(croppedWidth, Math.floor(imageWidth * 0.5)),
        height: imageHeight,
      });

      const croppedImage = await context.renderAsync();

      const result = await croppedImage.saveAsync({
        compress: 0.5,
        format: ImageManipulator.SaveFormat.JPEG,
      });

      return result.uri;
    } catch (error) {
      console.error("Error cropping image:", error);
      return imageUri; // Return original if cropping fails
    }
  }

  async function uploadPhoto(photoUri: string, capturedText: string) {
    setIsUploading(true);

    try {
      const formData = new FormData();

      formData.append("files", {
        uri: photoUri,
        type: "image/jpeg",
        name: "photo.jpg",
      } as any);

      // formData.append("user_prompt", capturedText);
      formData.append(
        "user_prompt",
        "Turn this into a superhero comic book cover"
      );

      const response = await fetch(`${config.API_URL}/images`, {
        method: "POST",
        body: formData,
        headers: { "X-API-Key": config.API_KEY },
      });

      if (response.ok) {
        const result = await response.json();
        console.log("Upload result:", result);
      } else {
        throw new Error(`Upload failed with status: ${response.status}`);
      }
    } catch (error) {
      console.error("Upload error:", error);
    } finally {
      setIsUploading(false);
    }
  }

  async function takePicture() {
    // Block rapid picture taking
    if (pictureBlock.current) return;
    pictureBlock.current = true;

    if (cameraRef.current) {
      try {
        player.seekTo(0);
        player.play();

        const capturedText = transcription.capturedText;

        transcription.clearCaptured();

        await sleep(500);

        const photo = await cameraRef.current.takePictureAsync();

        if (photo) {
          const croppedImageUri = await cropImage(photo.uri);
          setCapturedImage(croppedImageUri);

          // Upload the cropped photo with captured text
          // await uploadPhoto(croppedImageUri, capturedText);
        }
      } catch (error) {
        console.error("Error taking picture:", error);
      }
    }
  }

  useVolumeChange(() => {
    takePicture();
  });

  // Reset picture block after 5 seconds
  useInterval(() => {
    pictureBlock.current = false;
  }, 5000);

  useEffect(() => {
    if (cameraPermission && cameraPermission.granted) {
      transcription.start();
    }
  }, [cameraPermission]);

  if (!cameraPermission) {
    return <View />;
  }

  if (!cameraPermission.granted) {
    return (
      <View
        style={[
          styles.container,
          { justifyContent: "center", alignItems: "center" },
        ]}
      >
        <Text style={styles.message}>
          We need your permission to show the camera
        </Text>
        <Button onPress={requestCameraPermission} title="grant permission" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar hidden />
      <View
        style={{
          ...styles.cameraContainer,
          top: dimensions.height / 2 - cameraViewfinderSize / 2,
        }}
      >
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing="back"
          flash="on"
        />
        <ViewfinderOverlay />
        <View style={styles.viewFinderMask} />
      </View>

      {capturedImage && (
        <View style={styles.imageContainer}>
          <Image source={{ uri: capturedImage }} style={styles.capturedImage} />
        </View>
      )}

      {transcription.capturedText.length > 0 && (
        <TouchableOpacity
          style={styles.capturedTextContainer}
          onPress={transcription.clearCaptured}
          activeOpacity={0.8}
        >
          <Text style={styles.capturedText}>{transcription.capturedText}</Text>
        </TouchableOpacity>
      )}

      {transcription.recognizing && transcription.transcript.length > 0 && (
        <Text
          style={styles.transcriptionMessage}
          numberOfLines={1}
          ellipsizeMode="head"
        >
          {transcription.transcript}
        </Text>
      )}

      {isUploading && (
        <View style={styles.uploadIndicator}>
          <Text style={styles.uploadText}>Uploading photo...</Text>
        </View>
      )}
    </View>
  );
}

function ViewfinderOverlay() {
  return (
    <View style={styles.viewfinderOverlay}>
      <View style={[styles.cornerBracket, styles.topLeft]} />
      <View style={[styles.cornerBracket, styles.topRight]} />
      <View style={[styles.cornerBracket, styles.bottomLeft]} />
      <View style={[styles.cornerBracket, styles.bottomRight]} />
      <View style={[styles.innerCornerBracket, styles.innerTopLeft]} />
      <View style={[styles.innerCornerBracket, styles.innerTopRight]} />
      <View style={[styles.innerCornerBracket, styles.innerBottomLeft]} />
      <View style={[styles.innerCornerBracket, styles.innerBottomRight]} />
      <View style={styles.focusCircle} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "black",
  },
  message: {
    textAlign: "center",
    paddingBottom: 10,
    color: "white",
  },
  transcriptionMessage: {
    position: "absolute",
    bottom: 50,
    left: 20,
    right: 20,
    color: "white",
    fontSize: 12,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 15,
    textAlign: "center",
  },
  cameraContainer: {
    position: "absolute",
    right: 0,
    width: cameraViewfinderSize,
    height: cameraViewfinderSize,
  },
  camera: {
    width: cameraViewfinderSize,
    height: cameraViewfinderSize * 2,
  },
  viewFinderMask: {
    position: "absolute",
    top: cameraViewfinderSize,
    left: 0,
    right: 0,
    height: cameraViewfinderSize,
    backgroundColor: "black",
  },
  viewfinderOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 8,
  },
  cornerBracket: {
    position: "absolute",
    width: 15,
    height: 15,
    borderColor: "rgba(255, 255, 255, 0.8)",
    borderWidth: 1.5,
  },
  topLeft: {
    top: 5,
    left: 5,
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  topRight: {
    top: 5,
    right: 5,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
  },
  bottomLeft: {
    bottom: 5,
    left: 5,
    borderRightWidth: 0,
    borderTopWidth: 0,
  },
  bottomRight: {
    bottom: 5,
    right: 5,
    borderLeftWidth: 0,
    borderTopWidth: 0,
  },
  innerCornerBracket: {
    position: "absolute",
    width: 10,
    height: 10,
    borderColor: "rgba(255, 255, 255, 0.6)",
    borderWidth: 1,
  },
  innerTopLeft: {
    top: "50%",
    left: "50%",
    marginTop: -30,
    marginLeft: -30,
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  innerTopRight: {
    top: "50%",
    right: "50%",
    marginTop: -30,
    marginRight: -30,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
  },
  innerBottomLeft: {
    bottom: "50%",
    left: "50%",
    marginBottom: -30,
    marginLeft: -30,
    borderRightWidth: 0,
    borderTopWidth: 0,
  },
  innerBottomRight: {
    bottom: "50%",
    right: "50%",
    marginBottom: -30,
    marginRight: -30,
    borderLeftWidth: 0,
    borderTopWidth: 0,
  },
  rangefinderMarks: {
    ...StyleSheet.absoluteFillObject,
  },
  rangeMark: {
    position: "absolute",
    width: 8,
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.6)",
  },
  focusCircle: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.5)",
    backgroundColor: "transparent",
    marginTop: -20,
    marginLeft: -20,
  },
  imageContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-start",
    alignItems: "center",
    padding: 50,
  },
  capturedImage: {
    width: 250,
    height: 250,
    borderRadius: 5,
    transform: [{ rotate: "90deg" }],
    objectFit: "contain",
  },
  capturedTextContainer: {
    position: "absolute",
    top: 60,
    left: 20,
    right: 20,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    borderRadius: 15,
    padding: 20,
    zIndex: 10,
  },
  capturedText: {
    color: "white",
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 10,
    textAlign: "left",
  },
  uploadIndicator: {
    position: "absolute",
    bottom: 100,
    left: 20,
    right: 20,
    backgroundColor: "rgba(0, 100, 200, 0.8)",
    borderRadius: 15,
    padding: 15,
    zIndex: 10,
  },
  uploadText: {
    color: "white",
    fontSize: 14,
    textAlign: "center",
  },
});
