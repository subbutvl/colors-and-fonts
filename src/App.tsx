import { useEffect } from "react";
import { Sidebar } from "./components/Sidebar";
import { applySavedShortcuts } from "./lib/shortcuts";
import { BrandColorsPage } from "./pages/BrandColorsPage";
import { ColorNamesPage } from "./pages/ColorNamesPage";
import { ColorPage } from "./pages/ColorPage";
import { colorFromRoute } from "./lib/colorDetails";
import { ContrastPage } from "./pages/ContrastPage";
import { ConverterPage } from "./pages/ConverterPage";
import { CssGeneratorPage } from "./pages/CssGeneratorPage";
import { FontListingPage } from "./pages/FontListingPage";
import { TopFontsPage } from "./pages/TopFontsPage";
import { CuratedColorsPage } from "./pages/CuratedColorsPage";
import { CuratedFontsPage } from "./pages/CuratedFontsPage";
import { FontPairingPage } from "./pages/FontPairingPage";
import { IdentifyFontPage } from "./pages/IdentifyFontPage";
import { SavedPage } from "./pages/SavedPage";
import { ImagePalettePage } from "./pages/ImagePalettePage";
import { PairingPage } from "./pages/PairingPage";
import { PalettesPage } from "./pages/PalettesPage";
import { MyDesignSystemsPage } from "./pages/MyDesignSystemsPage";
import { PantonePage } from "./pages/PantonePage";
import { PickerHome } from "./pages/PickerHome";
import { ScalesPage } from "./pages/ScalesPage";
import { CuratedDesignSystemsPage } from "./pages/CuratedDesignSystemsPage";
import { DesignSystemsHubPage } from "./pages/DesignSystemsHubPage";
import { GradientsPage } from "./pages/GradientsPage";
import { GuessPage } from "./pages/GuessPage";
import { Placeholder } from "./pages/Placeholder";
import { SettingsPage } from "./pages/SettingsPage";
import { VisionPage } from "./pages/VisionPage";
import { DEFAULT_SECTION, findSection } from "./sections";
import { SettingsProvider } from "./SettingsContext";
import { useHashRoute } from "./useHashRoute";
import { usePickRecorder } from "./usePickRecorder";

function Page({ id, arg }: { id: string; arg?: string }) {
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
    case "color-pairing":
      return <PairingPage section={section} />;
    case "color-blindness":
      return <VisionPage section={section} />;
    case "css-generator":
      return <CssGeneratorPage section={section} />;
    case "font-listing":
      return <FontListingPage section={section} />;
    case "top-fonts":
      return <TopFontsPage section={section} />;
    case "curated-fonts":
      return <CuratedFontsPage section={section} />;
    case "font-pairing":
      return <FontPairingPage section={section} />;
    case "identify":
      return <IdentifyFontPage section={section} />;
    case "saved":
      return <SavedPage section={section} />;
    case "image-palette":
      return <ImagePalettePage section={section} />;
    case "curated-colors":
      return <CuratedColorsPage section={section} />;
    case "brand-colors":
      return <BrandColorsPage section={section} />;
    case "design-systems":
      return <DesignSystemsHubPage section={section} />;
    case "curated-design-systems":
      return <CuratedDesignSystemsPage section={section} />;
    case "my-design-systems":
      return <MyDesignSystemsPage section={section} />;
    case "guess-the-color":
      return <GuessPage section={section} />;
    case "gradients":
      return <GradientsPage section={section} />;
    case "pantone":
      return <PantonePage section={section} />;
    case "html-color-names":
      return <ColorNamesPage section={section} />;
    case "settings":
      return <SettingsPage />;
    case "color":
      return <ColorPage hex={colorFromRoute(arg)} />;
    default:
      return <Placeholder section={section} />;
  }
}

export default function App() {
  const [active, navigate, arg] = useHashRoute();
  usePickRecorder();

  // Re-register the user's saved shortcuts (Rust starts with the defaults).
  // Pages that show shortcuts wait for this through getShortcutStatus().
  useEffect(() => {
    void applySavedShortcuts();
    // Weekly font catalog refresh when an API key is saved (Settings → Fonts).
    void import("./lib/fonts").then((m) => m.refreshIfStale());
  }, []);
  return (
    <SettingsProvider>
      <div className="app">
        <Sidebar active={active} onNavigate={navigate} />
        <main className="content">
          <Page id={active} arg={arg} />
        </main>
      </div>
    </SettingsProvider>
  );
}
