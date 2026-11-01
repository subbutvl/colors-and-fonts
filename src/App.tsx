import { Sidebar } from "./components/Sidebar";
import { PickerHome } from "./pages/PickerHome";
import { Placeholder } from "./pages/Placeholder";
import { DEFAULT_SECTION, findSection } from "./sections";
import { useHashRoute } from "./useHashRoute";
import { useTheme } from "./useTheme";

export default function App() {
  const [active, navigate] = useHashRoute();
  const [theme, setTheme] = useTheme();
  const section = findSection(active) ?? findSection(DEFAULT_SECTION)!;

  return (
    <div className="app">
      <Sidebar active={section.id} onNavigate={navigate} theme={theme} onTheme={setTheme} />
      <main className="content">
        {section.id === "picker" ? <PickerHome /> : <Placeholder section={section} />}
      </main>
    </div>
  );
}
