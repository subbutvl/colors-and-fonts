//! Windows side of font identify: Windows.Media.Ocr for the text and UI
//! Automation for the exact font name.

use image::RgbaImage;
use windows::Globalization::Language;
use windows::Graphics::Imaging::{BitmapAlphaMode, BitmapPixelFormat, SoftwareBitmap};
use windows::Media::Ocr::OcrEngine;
use windows::Storage::Streams::DataWriter;
use windows::Win32::Foundation::POINT;
use windows::Win32::System::Com::{
    CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED, CoCreateInstance, CoInitializeEx, CoUninitialize,
};
use windows::Win32::UI::Accessibility::{
    CUIAutomation, IUIAutomation, IUIAutomationTextPattern, TextUnit_Character,
    UIA_FontNameAttributeId, UIA_FontSizeAttributeId, UIA_TextPatternId,
};
use windows::Win32::System::Variant::{VARIANT, VT_BSTR, VT_R8, VariantClear};
use windows::core::HSTRING;

use super::{ExactFont, FontProbe, Line, OcrText, TextReader, Word};

/// Joins this thread to the COM/WinRT multithreaded apartment for its
/// lifetime. Captures run on short-lived worker threads that are not
/// initialized, and WinRT and UIA objects must be created on one that is.
struct Mta(bool);

impl Mta {
    fn enter() -> Self {
        Mta(unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) }.is_ok())
    }
}

impl Drop for Mta {
    fn drop(&mut self) {
        if self.0 {
            unsafe { CoUninitialize() };
        }
    }
}

pub struct WindowsOcr;

impl TextReader for WindowsOcr {
    fn read(&self, image: &RgbaImage) -> Result<OcrText, String> {
        let _mta = Mta::enter();
        read(image).map_err(|e| format!("Windows text recognition failed: {}", e.message()))
    }
}

fn engine() -> windows::core::Result<OcrEngine> {
    // The user's display languages first; English if none has OCR installed.
    OcrEngine::TryCreateFromUserProfileLanguages().or_else(|_| {
        OcrEngine::TryCreateFromLanguage(&Language::CreateLanguage(&HSTRING::from("en-US"))?)
    })
}

fn read(image: &RgbaImage) -> windows::core::Result<OcrText> {
    // OCR wants BGRA; our frames are RGBA.
    let mut bgra = image.as_raw().clone();
    for px in bgra.as_chunks_mut::<4>().0 {
        px.swap(0, 2);
    }
    let writer = DataWriter::new()?;
    writer.WriteBytes(&bgra)?;
    let buffer = writer.DetachBuffer()?;
    let bitmap = SoftwareBitmap::CreateCopyWithAlphaFromBuffer(
        &buffer,
        BitmapPixelFormat::Bgra8,
        image.width() as i32,
        image.height() as i32,
        BitmapAlphaMode::Premultiplied,
    )?;
    let engine = engine()?;
    let result = engine.RecognizeAsync(&bitmap)?.join()?;
    let mut lines = Vec::new();
    for line in result.Lines()? {
        let mut words = Vec::new();
        for word in line.Words()? {
            let r = word.BoundingRect()?;
            words.push(Word {
                text: word.Text()?.to_string(),
                x: r.X,
                y: r.Y,
                width: r.Width,
                height: r.Height,
            });
        }
        lines.push(Line {
            text: line.Text()?.to_string(),
            words,
        });
    }
    Ok(OcrText {
        text: result.Text()?.to_string(),
        lines,
        language: engine.RecognizerLanguage()?.LanguageTag()?.to_string(),
    })
}

pub struct UiAutomation;

impl FontProbe for UiAutomation {
    fn font_at(&self, x: i32, y: i32) -> Option<ExactFont> {
        let _mta = Mta::enter();
        probe(x, y).ok().flatten()
    }
}

fn probe(x: i32, y: i32) -> windows::core::Result<Option<ExactFont>> {
    unsafe {
        let uia: IUIAutomation = CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER)?;
        let point = POINT { x, y };
        let element = uia.ElementFromPoint(point)?;
        let Ok(pattern) = element.GetCurrentPatternAs::<IUIAutomationTextPattern>(UIA_TextPatternId)
        else {
            return Ok(None);
        };
        let range = pattern.RangeFromPoint(point)?;
        // A single character: the font right under the selection's centre.
        range.ExpandToEnclosingUnit(TextUnit_Character)?;
        let mut name = range.GetAttributeValue(UIA_FontNameAttributeId)?;
        // Mixed fonts come back as a sentinel object, not a string.
        let font = string_of(&name);
        let _ = VariantClear(&mut name);
        let Some(name) = font.filter(|n| !n.trim().is_empty()) else {
            return Ok(None);
        };
        let size = match range.GetAttributeValue(UIA_FontSizeAttributeId) {
            Ok(mut v) => {
                let s = double_of(&v).filter(|s| *s > 0.0);
                let _ = VariantClear(&mut v);
                s
            }
            Err(_) => None,
        };
        Ok(Some(ExactFont { name, size }))
    }
}

/// The string in a VT_BSTR variant.
unsafe fn string_of(v: &VARIANT) -> Option<String> {
    unsafe {
        let inner = &v.Anonymous.Anonymous;
        (inner.vt == VT_BSTR).then(|| inner.Anonymous.bstrVal.to_string())
    }
}

/// The number in a VT_R8 variant.
unsafe fn double_of(v: &VARIANT) -> Option<f64> {
    unsafe {
        let inner = &v.Anonymous.Anonymous;
        (inner.vt == VT_R8).then_some(inner.Anonymous.dblVal)
    }
}
