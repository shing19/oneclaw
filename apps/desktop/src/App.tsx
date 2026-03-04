import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

function App(): React.JSX.Element {
  const [greeting, setGreeting] = useState<string>("");

  useEffect(() => {
    invoke<string>("greet", { name: "OneClaw" })
      .then((result) => {
        setGreeting(result);
      })
      .catch((err: unknown) => {
        console.error("Failed to invoke greet:", err);
      });
  }, []);

  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <h1>OneClaw Desktop</h1>
      <p>{greeting || "正在连接..."}</p>
    </main>
  );
}

export default App;
