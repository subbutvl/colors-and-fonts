//! Font identify, capture side: the user drags a box around text on the
//! frozen screen (overlay in font mode), we crop it, read the text with the
//! OS OCR engine, and ask the accessibility API for the exact font name at
//! that spot. Matching the crop against Google Fonts comes later (3.4).
//!
//! The OS parts sit behind [`TextReader`] and [`FontProbe`]; Windows uses
//! Windows.Media.Ocr and UI Automation (`windows.rs`). Other systems get
//! stubs that say so, until they have their own implementation.

#[cfg(windows)]
mod windows;

use image::{RgbaImage, imageops};
use serde::Serialize;

/// Selections smaller than this (physical pixels) are ignored as clicks.
pub const MIN_REGION: u32 = 6;

/// OCR is most reliable when text is at least this tall; smaller crops are
/// scaled up before reading.
const OCR_MIN_HEIGHT: u32 = 48;
const OCR_MAX_SCALE: u32 = 4;
/// Windows.Media.Ocr rejects images larger than this on either side.
const OCR_MAX_SIDE: u32 = 2600;

/// A rectangle in a frame's own pixels.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Deserialize, Serialize)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Word {
    pub text: String,
    /// Box inside the crop, in crop pixels.
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Line {
    pub text: String,
    pub words: Vec<Word>,
}

#[derive(Debug, Clone, Default, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OcrText {
    pub text: String,
    pub lines: Vec<Line>,
    /// BCP-47 tag of the OCR language used, e.g. "en-US".
    pub language: String,
}

/// What the accessibility API says about the text under a point.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ExactFont {
    pub name: String,
    /// Points, when the app reports it.
    pub size: Option<f64>,
}

/// Everything one capture found, sent to the main window.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FontCapture {
    /// The selection on the virtual desktop, physical pixels.
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub ocr: Option<OcrText>,
    /// Why OCR gave nothing, if it failed.
    pub ocr_error: Option<String>,
    pub exact: Option<ExactFont>,
    /// Median word height in crop pixels: a cue for matching and for "text too small".
    pub text_height: Option<f32>,
    pub elapsed_ms: f64,
}

pub trait TextReader {
    fn read(&self, image: &RgbaImage) -> Result<OcrText, String>;
}

pub trait FontProbe {
    /// Font at a physical virtual-desktop point, if the app under it tells.
    fn font_at(&self, x: i32, y: i32) -> Option<ExactFont>;
}

/// The OCR engine for this OS.
pub fn text_reader() -> impl TextReader {
    #[cfg(windows)]
    {
        windows::WindowsOcr
    }
    #[cfg(not(windows))]
    {
        Unsupported
    }
}

/// The accessibility probe for this OS.
pub fn font_probe() -> impl FontProbe {
    #[cfg(windows)]
    {
        windows::UiAutomation
    }
    #[cfg(not(windows))]
    {
        Unsupported
    }
}

#[cfg(not(windows))]
struct Unsupported;

#[cfg(not(windows))]
impl TextReader for Unsupported {
    fn read(&self, _: &RgbaImage) -> Result<OcrText, String> {
        Err("Text recognition is only available on Windows for now.".into())
    }
}

#[cfg(not(windows))]
impl FontProbe for Unsupported {
    fn font_at(&self, _: i32, _: i32) -> Option<ExactFont> {
        None
    }
}

/// `rect` clamped to an image of `width` x `height`; None if nothing is left.
pub fn clamp_rect(rect: Rect, width: u32, height: u32) -> Option<Rect> {
    let x0 = rect.x.max(0) as i64;
    let y0 = rect.y.max(0) as i64;
    let x1 = (i64::from(rect.x) + i64::from(rect.width)).min(i64::from(width));
    let y1 = (i64::from(rect.y) + i64::from(rect.height)).min(i64::from(height));
    if x1 <= x0 || y1 <= y0 {
        return None;
    }
    Some(Rect {
        x: x0 as i32,
        y: y0 as i32,
        width: (x1 - x0) as u32,
        height: (y1 - y0) as u32,
    })
}

pub fn crop(image: &RgbaImage, rect: Rect) -> Option<RgbaImage> {
    let r = clamp_rect(rect, image.width(), image.height())?;
    Some(imageops::crop_imm(image, r.x as u32, r.y as u32, r.width, r.height).to_image())
}

/// Whole-number upscale that brings small text up to a readable height
/// without passing the OCR engine's size limit.
pub fn ocr_scale(width: u32, height: u32) -> u32 {
    if height == 0 || width == 0 {
        return 1;
    }
    let want = OCR_MIN_HEIGHT.div_ceil(height).clamp(1, OCR_MAX_SCALE);
    let fits = (OCR_MAX_SIDE / width.max(height)).max(1);
    want.min(fits)
}

/// Read `image`, scaling it up first when the text is small, and map the
/// word boxes back to crop pixels.
pub fn read_text(reader: &impl TextReader, image: &RgbaImage) -> Result<OcrText, String> {
    let scale = ocr_scale(image.width(), image.height());
    let scaled;
    let input = if scale > 1 {
        scaled = imageops::resize(
            image,
            image.width() * scale,
            image.height() * scale,
            imageops::FilterType::CatmullRom,
        );
        &scaled
    } else {
        image
    };
    let input = if input.width() > OCR_MAX_SIDE || input.height() > OCR_MAX_SIDE {
        return Err(format!(
            "The selection is too large to read ({} x {} px). Select one or a few lines of text.",
            image.width(),
            image.height()
        ));
    } else {
        input
    };
    let mut out = reader.read(input)?;
    if scale > 1 {
        let k = scale as f32;
        for word in out.lines.iter_mut().flat_map(|l| l.words.iter_mut()) {
            word.x /= k;
            word.y /= k;
            word.width /= k;
            word.height /= k;
        }
    }
    Ok(out)
}

/// Median word height, a stand-in for the text's size in pixels.
pub fn median_word_height(ocr: &OcrText) -> Option<f32> {
    let mut h: Vec<f32> = ocr
        .lines
        .iter()
        .flat_map(|l| l.words.iter().map(|w| w.height))
        .filter(|h| *h > 0.0)
        .collect();
    if h.is_empty() {
        return None;
    }
    h.sort_by(|a, b| a.total_cmp(b));
    Some(h[h.len() / 2])
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::Rgba;

    #[test]
    fn clamps_rects_to_the_frame() {
        let r = |x, y, width, height| Rect {
            x,
            y,
            width,
            height,
        };
        assert_eq!(clamp_rect(r(10, 10, 20, 5), 100, 50), Some(r(10, 10, 20, 5)));
        assert_eq!(clamp_rect(r(-5, -5, 20, 20), 100, 50), Some(r(0, 0, 15, 15)));
        assert_eq!(clamp_rect(r(90, 40, 20, 20), 100, 50), Some(r(90, 40, 10, 10)));
        assert_eq!(clamp_rect(r(200, 0, 10, 10), 100, 50), None);
        assert_eq!(clamp_rect(r(0, 0, 0, 10), 100, 50), None);
    }

    #[test]
    fn crops_the_selection() {
        let img = RgbaImage::from_fn(10, 10, |x, y| Rgba([x as u8, y as u8, 0, 255]));
        let c = crop(
            &img,
            Rect {
                x: 2,
                y: 3,
                width: 4,
                height: 2,
            },
        )
        .unwrap();
        assert_eq!((c.width(), c.height()), (4, 2));
        assert_eq!(c.get_pixel(0, 0), &Rgba([2, 3, 0, 255]));
        assert_eq!(c.get_pixel(3, 1), &Rgba([5, 4, 0, 255]));
    }

    #[test]
    fn scales_small_text_up_within_limits() {
        assert_eq!(ocr_scale(300, 16), 3);
        assert_eq!(ocr_scale(300, 10), 4);
        assert_eq!(ocr_scale(300, 60), 1);
        // A long thin strip cannot grow past the engine's limit.
        assert_eq!(ocr_scale(1500, 12), 1);
        assert_eq!(ocr_scale(0, 0), 1);
    }

    struct Fake;
    impl TextReader for Fake {
        fn read(&self, image: &RgbaImage) -> Result<OcrText, String> {
            // One word filling the image the engine saw.
            Ok(OcrText {
                text: "Hello".into(),
                lines: vec![Line {
                    text: "Hello".into(),
                    words: vec![Word {
                        text: "Hello".into(),
                        x: 0.0,
                        y: 0.0,
                        width: image.width() as f32,
                        height: image.height() as f32,
                    }],
                }],
                language: "en-US".into(),
            })
        }
    }

    #[test]
    fn maps_boxes_back_after_scaling() {
        let img = RgbaImage::new(100, 16);
        let out = read_text(&Fake, &img).unwrap();
        let w = &out.lines[0].words[0];
        assert_eq!((w.width, w.height), (100.0, 16.0));
        assert_eq!(median_word_height(&out), Some(16.0));
    }

    #[test]
    fn refuses_huge_selections() {
        let img = RgbaImage::new(3000, 200);
        assert!(read_text(&Fake, &img).is_err());
    }
}
