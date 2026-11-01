//! Pure pixel sampling on a captured RGBA image. No OS calls here, so all of
//! it is unit tested.

use image::RgbaImage;
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

/// The `n` x `n` block of pixels centred on (`cx`, `cy`), row by row, for the
/// loupe. Cells outside the image are `None` so the loupe can draw them empty.
/// `n` is rounded up to odd so there is a true centre cell.
// Used by the capture overlay's loupe (roadmap step 1.2).
#[allow(dead_code)]
pub fn grid(img: &RgbaImage, cx: i64, cy: i64, n: u32) -> Vec<Option<Rgb>> {
    let n = n.max(1) | 1;
    let r = i64::from(n / 2);
    let mut cells = Vec::with_capacity((n * n) as usize);
    for y in (cy - r)..=(cy + r) {
        for x in (cx - r)..=(cx + r) {
            cells.push(pixel_at(img, x, y));
        }
    }
    cells
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
        assert_eq!(grid(&ramp(), 1, 1, 2).len(), 9);
    }

    #[test]
    fn loupe_grid_is_row_major_with_empty_edges() {
        let cells = grid(&ramp(), 0, 0, 3);
        assert_eq!(cells.len(), 9);
        assert_eq!(cells[0], None); // (-1,-1)
        assert_eq!(cells[4], Some(Rgb::new(0, 0, 200))); // centre (0,0)
        assert_eq!(cells[5], Some(Rgb::new(10, 0, 200))); // (1,0)
        assert_eq!(cells[7], Some(Rgb::new(0, 10, 200))); // (0,1)
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
}
