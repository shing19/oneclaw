import { AppLayout } from "@/components";
import { useEventSubscriptions } from "@/hooks";

function App(): React.JSX.Element {
  useEventSubscriptions();
  return <AppLayout />;
}

export default App;
