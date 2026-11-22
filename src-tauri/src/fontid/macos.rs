//! macOS side of font identify: Apple's Vision framework reads the text.
//!
//! There is no exact-font probe here: asking apps for their font would need
//! the Accessibility permission, and we agreed (2026-11-22) to start with OCR
//! only, so matching relies on letter shapes alone.

use std::io::Cursor;

use image::{ImageFormat, RgbaImage};
use objc2::rc::{Retained, autoreleasepool};
use objc2::runtime::AnyObject;
use objc2::{AnyThread, msg_send};
use objc2_foundation::{NSArray, NSData, NSDictionary, NSError, NSRange, NSRect};
use objc2_vision::{
    VNImageRequestHandler, VNRecognizeTextRequest, VNRequest, VNRequestTextRecognitionLevel,
};

use super::{Line, OcrText, TextReader, Word};

pub struct VisionOcr;

impl TextReader for VisionOcr {
    fn read(&self, image: &RgbaImage) -> Result<OcrText, String> {
        autoreleasepool(|_| read(image)).map_err(|e| format!("macOS text recognition failed: {e}"))
    }
}

fn read(image: &RgbaImage) -> Result<OcrText, String> {
    // Vision takes encoded image data; PNG keeps every pixel.
    let mut png = Vec::new();
    image
        .write_to(&mut Cursor::new(&mut png), ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    let data = NSData::with_bytes(&png);
    let handler = VNImageRequestHandler::initWithData_options(
        VNImageRequestHandler::alloc(),
        &data,
        &NSDictionary::new(),
    );
    let request = VNRecognizeTextRequest::new();
    request.setRecognitionLevel(VNRequestTextRecognitionLevel::Accurate);
    request.setUsesLanguageCorrection(true);
    let as_request: &VNRequest = &request;
    handler
        .performRequests_error(&NSArray::from_slice(&[as_request]))
        .map_err(|e| e.localizedDescription().to_string())?;

    let (w, h) = (f64::from(image.width()), f64::from(image.height()));
    let mut lines = Vec::new();
    for observation in request.results().map(|r| r.to_vec()).unwrap_or_default() {
        let Some(top) = observation.topCandidates(1).firstObject() else { continue };
        let text = top.string().to_string();
        let mut words = Vec::new();
        for (start, len, word) in utf16_words(&text) {
            let range = NSRange::new(start, len);
            // SAFETY: `boundingBoxForRange:error:` (macOS 10.15+) returns a
            // VNRectangleObservation or nil with an error.
            let found: Result<Retained<AnyObject>, Retained<NSError>> =
                unsafe { msg_send![&*top, boundingBoxForRange: range, error: _] };
            let Ok(found) = found else { continue };
            // SAFETY: VNRectangleObservation's `boundingBox` is a CGRect.
            let rect: NSRect = unsafe { msg_send![&*found, boundingBox] };
            let (x, y, width, height) =
                to_pixels(rect.origin.x, rect.origin.y, rect.size.width, rect.size.height, w, h);
            words.push(Word { text: word, x, y, width, height });
        }
        lines.push(Line { text, words });
    }
    let text = lines.iter().map(|l| l.text.as_str()).collect::<Vec<_>>().join("\n");
    Ok(OcrText {
        text,
        lines,
        // Vision's default recognition language.
        language: "en-US".into(),
    })
}

/// The words of `text` with their start and length in UTF-16 code units,
/// which is what NSRange counts.
fn utf16_words(text: &str) -> Vec<(usize, usize, String)> {
    let mut out = Vec::new();
    let mut at = 0;
    let mut current: Option<(usize, String)> = None;
    for ch in text.chars() {
        let units = ch.len_utf16();
        if ch.is_whitespace() {
            if let Some((start, word)) = current.take() {
                out.push((start, at - start, word));
            }
        } else {
            current.get_or_insert_with(|| (at, String::new())).1.push(ch);
        }
        at += units;
    }
    if let Some((start, word)) = current {
        out.push((start, at - start, word));
    }
    out
}

/// A Vision box (normalized, origin bottom left) in image pixels with the
/// origin top left, like the Windows engine's boxes.
fn to_pixels(x: f64, y: f64, width: f64, height: f64, w: f64, h: f64) -> (f32, f32, f32, f32) {
    (
        (x * w) as f32,
        ((1.0 - y - height) * h) as f32,
        (width * w) as f32,
        (height * h) as f32,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn words_count_utf16_units() {
        assert_eq!(
            utf16_words("Hello  wörld"),
            vec![(0, 5, "Hello".into()), (7, 5, "wörld".into())]
        );
        // An emoji is two UTF-16 units.
        assert_eq!(utf16_words("a😀 b"), vec![(0, 3, "a😀".into()), (4, 1, "b".into())]);
        assert!(utf16_words("   ").is_empty());
    }

    #[test]
    fn boxes_flip_to_top_left() {
        // The top half of a 200 x 100 image.
        assert_eq!(to_pixels(0.0, 0.5, 1.0, 0.5, 200.0, 100.0), (0.0, 0.0, 200.0, 50.0));
        // A word at the bottom left.
        assert_eq!(to_pixels(0.1, 0.0, 0.2, 0.25, 200.0, 100.0), (20.0, 75.0, 40.0, 25.0));
    }
}
