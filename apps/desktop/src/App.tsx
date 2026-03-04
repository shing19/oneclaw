import { useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components";
import { useEventSubscriptions } from "@/hooks";
import SetupWizardPage from "@/pages/setup-wizard";

const WIZARD_DONE_KEY = "oneclaw-wizard-done";

function App(): React.JSX.Element {
  useEventSubscriptions();

  const [showWizard, setShowWizard] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // Check if wizard has been completed before
    const done = localStorage.getItem(WIZARD_DONE_KEY);
    if (done !== "true") {
      setShowWizard(true);
    }
    setChecked(true);
  }, []);

  const handleWizardComplete = useCallback(() => {
    localStorage.setItem(WIZARD_DONE_KEY, "true");
    setShowWizard(false);
  }, []);

  if (!checked) return <></>;

  return (
    <>
      <AppLayout />
      {showWizard && <SetupWizardPage onComplete={handleWizardComplete} />}
    </>
  );
}

export default App;
