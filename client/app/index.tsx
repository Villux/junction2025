import { Poladroid } from "@/components/Poladroid";
import { useState } from "react";
import { VolumeManager } from "react-native-volume-manager";

VolumeManager.showNativeVolumeUI({ enabled: false });

export default function Index() {
  const [key, setKey] = useState(0);

  function resetApp() {
    setKey((prevKey) => prevKey + 1);
  }

  return <Poladroid key={key} resetApp={resetApp} />;
}
