//! Pure pixel sampling on a captured RGBA image. No OS calls here, so all of
//! it is unit tested. (The picker overlay's loupe samples its frozen frame in
//! the webview, see `src/overlay/pixels.ts`, using the same averaging rule.)

use image::{RgbaImage, imageops};
use serde::Serialize;

/// An sRGB color (alpha is dropped: screen pixels are opaque).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct Rgb {
    pub r: u8,
    pub g: u8,
    pub b: u8,
}

impl Rgb {
    pub const fn new(r: u8, g: u8, b: u8) -> Self {
        Self { r, g, b }
    }

    /// Uppercase `#RRGGBB`.
    pub fn hex(&self) -> String {
        format!("#{:02X}{:02X}{:02X}", self.r, self.g, self.b)
    }
}

/// A rectangle in some pixel space (monitor-local physical pixels here).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Region {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

/// The square of side `2 * radius + 1` centred on (`cx`, `cy`), clipped to a
/// `bounds_w` x `bounds_h` surface. `None` when the centre is outside it.
pub fn region_around(
    cx: i64,
    cy: i64,
    radius: u32,
    bounds_w: u32,
    bounds_h: u32,
) -> Option<Region> {
    if cx < 0 || cy < 0 || cx >= i64::from(bounds_w) || cy >= i64::from(bounds_h) {
        return None;
    }
    let r = i64::from(radius);
    let x0 = (cx - r).max(0);
    let y0 = (cy - r).max(0);
    let x1 = (cx + r).min(i64::from(bounds_w) - 1);
    let y1 = (cy + r).min(i64::from(bounds_h) - 1);
    Some(Region {
        x: x0 as u32,
        y: y0 as u32,
        width: (x1 - x0 + 1) as u32,
        height: (y1 - y0 + 1) as u32,
    })
}

/// The pixel at (`x`, `y`), or `None` when outside the image.
pub fn pixel_at(img: &RgbaImage, x: i64, y: i64) -> Option<Rgb> {
    if x < 0 || y < 0 || x >= i64::from(img.width()) || y >= i64::from(img.height()) {
        return None;
    }
    let p = img.get_pixel(x as u32, y as u32);
    Some(Rgb::new(p[0], p[1], p[2]))
}

/// Mean color of the `size` x `size` square centred on (`cx`, `cy`), counting
/// only pixels inside the image. `size` 1 is the single pixel; even sizes are
/// rounded up to the next odd one so the square stays centred.
///
/// Averages in sRGB with rounding, which is what other pickers' "3x3 / 5x5
/// average" does, so values match what users compare against.
pub fn average(img: &RgbaImage, cx: i64, cy: i64, size: u32) -> Option<Rgb> {
    let r = i64::from(size.max(1) / 2);
    let (mut sr, mut sg, mut sb, mut n) = (0u64, 0u64, 0u64, 0u64);
    for y in (cy - r)..=(cy + r) {
        for x in (cx - r)..=(cx + r) {
            if let Some(p) = pixel_at(img, x, y) {
                sr += u64::from(p.r);
                sg += u64::from(p.g);
                sb += u64::from(p.b);
                n += 1;
            }
        }
    }
    if n == 0 {
        return None;
    }
    let mean = |s: u64| ((s + n / 2) / n) as u8;
    Some(Rgb::new(mean(sr), mean(sg), mean(sb)))
}

/// The whole-point rectangle covering `region` (pixels), for capture APIs
/// that take points (macOS: `scale` pixels per point), clipped to a monitor
/// `points_w` x `points_h` points big. `None` when nothing is left.
pub fn points_covering(region: Region, scale: f64, points_w: u32, points_h: u32) -> Option<Region> {
    let s = if scale > 0.0 { scale } else { 1.0 };
    let lo = |p: u32| (f64::from(p) / s).floor() as u32;
    let hi = |p: u32, max: u32| ((f64::from(p) / s).ceil() as u32).min(max);
    let (x0, y0) = (lo(region.x), lo(region.y));
    let x1 = hi(region.x + region.width, points_w);
    let y1 = hi(region.y + region.height, points_h);
    (x1 > x0 && y1 > y0).then(|| Region {
        x: x0,
        y: y0,
        width: x1 - x0,
        height: y1 - y0,
    })
}

/// Cut the pixel `region` out of `image`, a capture of the point rectangle
/// `points`. The image's own size gives the real pixels per point; when that
/// is not a whole number the cut is resized to exactly `region`'s size, so
/// callers can index it the same way on every OS.
pub fn crop_to_pixels(image: &RgbaImage, points: Region, region: Region, scale: f64) -> Option<RgbaImage> {
    if image.width() == 0 || image.height() == 0 || points.width == 0 || points.height == 0 {
        return None;
    }
    let s = if scale > 0.0 { scale } else { 1.0 };
    let rx = f64::from(image.width()) / f64::from(points.width);
    let ry = f64::from(image.height()) / f64::from(points.height);
    let ix = ((f64::from(region.x) / s - f64::from(points.x)) * rx).round().max(0.0) as u32;
    let iy = ((f64::from(region.y) / s - f64::from(points.y)) * ry).round().max(0.0) as u32;
    if ix >= image.width() || iy >= image.height() {
        return None;
    }
    let iw = ((f64::from(region.width) / s * rx).round() as u32).clamp(1, image.width() - ix);
    let ih = ((f64::from(region.height) / s * ry).round() as u32).clamp(1, image.height() - iy);
    let cut = imageops::crop_imm(image, ix, iy, iw, ih).to_image();
    if cut.dimensions() == (region.width, region.height) {
        Some(cut)
    } else {
        Some(imageops::resize(&cut, region.width, region.height, imageops::FilterType::Nearest))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::Rgba;

    /// 4x3 image where pixel (x, y) is (x*10, y*10, 200).
    fn ramp() -> RgbaImage {
        RgbaImage::from_fn(4, 3, |x, y| {
            Rgba([(x * 10) as u8, (y * 10) as u8, 200, 255])
        })
    }

    #[test]
    fn hex_is_uppercase_and_padded() {
        assert_eq!(Rgb::new(0, 10, 255).hex(), "#000AFF");
    }

    #[test]
    fn single_pixel() {
        let img = ramp();
        assert_eq!(pixel_at(&img, 2, 1), Some(Rgb::new(20, 10, 200)));
        assert_eq!(pixel_at(&img, 4, 0), None);
        assert_eq!(pixel_at(&img, -1, 0), None);
        assert_eq!(average(&img, 2, 1, 1), Some(Rgb::new(20, 10, 200)));
    }

    #[test]
    fn area_average_inside() {
        // 3x3 around (1,1): x in 0..=2 -> mean 10, y in 0..=2 -> mean 10.
        assert_eq!(average(&ramp(), 1, 1, 3), Some(Rgb::new(10, 10, 200)));
    }

    #[test]
    fn area_average_clips_at_edges() {
        // 3x3 around (0,0) keeps only x 0..=1, y 0..=1: means 5 and 5.
        assert_eq!(average(&ramp(), 0, 0, 3), Some(Rgb::new(5, 5, 200)));
        assert_eq!(average(&ramp(), 10, 10, 3), None);
    }

    #[test]
    fn average_rounds_to_nearest() {
        let img = RgbaImage::from_fn(2, 1, |x, _| Rgba([x as u8, 0, 0, 255]));
        // (0 + 1) / 2 = 0.5 rounds up to 1.
        assert_eq!(average(&img, 0, 0, 3), Some(Rgb::new(1, 0, 0)));
    }

    #[test]
    fn even_sizes_round_up_to_odd() {
        assert_eq!(average(&ramp(), 1, 1, 2), average(&ramp(), 1, 1, 3));
    }

    #[test]
    fn region_is_clipped_to_bounds() {
        assert_eq!(
            region_around(5, 5, 2, 100, 100),
            Some(Region {
                x: 3,
                y: 3,
                width: 5,
                height: 5
            })
        );
        assert_eq!(
            region_around(0, 99, 2, 100, 100),
            Some(Region {
                x: 0,
                y: 97,
                width: 3,
                height: 3
            })
        );
        assert_eq!(region_around(100, 5, 2, 100, 100), None);
        assert_eq!(region_around(-1, 5, 2, 100, 100), None);
    }

    #[test]
    fn points_cover_a_retina_region() {
        // Pixels 101..=105 at 2x are points 50..53 (50.5 to 53 rounded out).
        let r = Region { x: 101, y: 20, width: 5, height: 5 };
        assert_eq!(points_covering(r, 2.0, 1440, 900), Some(Region { x: 50, y: 10, width: 3, height: 3 }));
        // At 1x points are pixels.
        assert_eq!(points_covering(r, 1.0, 1920, 1080), Some(r));
        // Clipped to the monitor.
        let edge = Region { x: 2878, y: 0, width: 4, height: 2 };
        assert_eq!(points_covering(edge, 2.0, 1440, 900), Some(Region { x: 1439, y: 0, width: 1, height: 1 }));
    }

    #[test]
    fn crop_retina_capture_back_to_pixels() {
        // A 3x3 point capture at 2x is 6x6 pixels; pixel (x, y) of the
        // monitor is (x*10, y*10) so we can see which ones we got.
        let points = Region { x: 50, y: 10, width: 3, height: 3 };
        let image = RgbaImage::from_fn(6, 6, |x, y| Rgba([((100 + x) * 2 % 256) as u8, ((20 + y) * 2) as u8, 0, 255]));
        let region = Region { x: 101, y: 20, width: 5, height: 5 };
        let cut = crop_to_pixels(&image, points, region, 2.0).unwrap();
        assert_eq!(cut.dimensions(), (5, 5));
        // Monitor pixel 101 is image column 1.
        assert_eq!(cut.get_pixel(0, 0), image.get_pixel(1, 0));
        assert_eq!(cut.get_pixel(4, 4), image.get_pixel(5, 4));
    }

    #[test]
    fn crop_is_identity_at_1x() {
        let img = ramp();
        let r = Region { x: 0, y: 0, width: 4, height: 3 };
        assert_eq!(crop_to_pixels(&img, r, r, 1.0).unwrap(), img);
    }
}
