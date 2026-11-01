import { useEffect } from "react";
import { Sidebar } from "./components/Sidebar";
import { applySavedShortcuts } from "./lib/shortcuts";
import { ColorNamesPage } from "./pages/ColorNamesPage";
import { ContrastPage } from "./pages/ContrastPage";
import { ConverterPage } from "./pages/ConverterPage";
import { PalettesPage } from "./pages/PalettesPage";
import { PickerHome } from "./pages/PickerHome";
import { ScalesPage } from "./pages/ScalesPage";
import { Placeholder } from "./pages/Placeholder";
import { SettingsPage } from "./pages/SettingsPage";
import { DEFAULT_SECTION, findSection } from "./sections";
import { SettingsProvider } from "./SettingsContext";
import { useHashRoute } from "./useHashRoute";
import { usePickRecorder } from "./usePickRecorder";

function Page({ id }: { id: string }) {
  const section = findSection(id) ?? findSection(DEFAULT_SECTION)!;
  switch (section.id) {
    case "picker":
      return <PickerHome />;
    case "contrast":
      return <ContrastPage section={section} />;
    case "converter":
      return <ConverterPage section={section} />;
    case "palettes":
      return <PalettesPage section={section} />;
    case "scales":
      return <ScalesPage section={section} />;
    case "html-color-names":
      return <ColorNamesPage section={section} />;
    case "settings":
      return <SettingsPage />;
    default:
      return <Placeholder section={section} />;
  }
}

export default function App() {
  const [active, navigate] = useHashRoute();
  usePickRecorder();

  // Re-register the user's saved shortcuts (Rust starts with the defaults).
  // Pages that show shortcuts wait for this through getShortcutStatus().
  useEffect(() => {
    void applySavedShortcuts();
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
