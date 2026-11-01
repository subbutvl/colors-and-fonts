import { useEffect } from "react";
import { Sidebar } from "./components/Sidebar";
import { applySavedShortcuts } from "./lib/shortcuts";
import { PickerHome } from "./pages/PickerHome";
import { Placeholder } from "./pages/Placeholder";
import { SettingsPage } from "./pages/SettingsPage";
import { DEFAULT_SECTION, findSection } from "./sections";
import { SettingsProvider } from "./SettingsContext";
import { useHashRoute } from "./useHashRoute";

function Page({ id }: { id: string }) {
  const section = findSection(id) ?? findSection(DEFAULT_SECTION)!;
  switch (section.id) {
    case "picker":
      return <PickerHome />;
    case "settings":
      return <SettingsPage />;
    default:
      return <Placeholder section={section} />;
  }
}

export default function App() {
  const [active, navigate] = useHashRoute();

  // Re-register the user's saved shortcuts (Rust starts with the defaults).
  useEffect(() => {
    applySavedShortcuts().catch((e) => console.warn("Could not apply saved shortcuts:", e));
  }, []);
  return (
    <SettingsProvider>
      <div className="app">
        <Sidebar active={active} onNavigate={navigate} />
        <main className="content">
          <Page id={active} />
        </main>
      </div>
    </SettingsProvider>
  );
}
