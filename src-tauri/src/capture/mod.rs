//! Screen capture and "color at a point".
//!
//! Coordinates are physical pixels on the virtual desktop, the same space as
//! `AppHandle::cursor_position()` and Win32 `GetCursorPos` (Tauri makes the
//! process per-monitor DPI aware). Each monitor has its own origin and scale
//! factor; we find the monitor under the point, convert to monitor-local
//! pixels and capture only a small square around it, so a pick costs a few
//! milliseconds rather than a full-screen grab.
//!
//! The OS side sits behind [`ScreenSource`] so macOS/Linux can get their own
//! implementation later and the mapping logic can be tested with a fake.

pub mod sampler;

use std::time::Instant;

use image::RgbaImage;
use serde::Serialize;

use sampler::{Region, Rgb};

/// Largest averaging square the commands accept (25x25).
pub const MAX_SAMPLE_SIZE: u32 = 25;

/// A monitor's place on the virtual desktop, in physical pixels.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorInfo {
    pub name: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    /// 1.0 at 100% Windows scaling, 1.5 at 150%, and so on.
    pub scale_factor: f32,
}

impl MonitorInfo {
    /// The point in this monitor's own pixel space (may be outside it).
    fn to_local(&self, x: i32, y: i32) -> (i64, i64) {
        (
            i64::from(x) - i64::from(self.x),
            i64::from(y) - i64::from(self.y),
        )
    }

    /// Whether the virtual-desktop point is on this monitor.
    pub fn contains(&self, x: i32, y: i32) -> bool {
        let (lx, ly) = self.to_local(x, y);
        lx >= 0 && ly >= 0 && lx < i64::from(self.width) && ly < i64::from(self.height)
    }
}

/// Something that can tell which monitor a point is on and capture part of it.
pub trait ScreenSource {
    /// Every connected monitor.
    fn monitors(&self) -> Result<Vec<MonitorInfo>, String>;
    fn monitor_at(&self, x: i32, y: i32) -> Result<MonitorInfo, String>;
    /// Capture `region` (monitor-local physical pixels) of `monitor`.
    fn capture(&self, monitor: &MonitorInfo, region: Region) -> Result<RgbaImage, String>;
}

/// What the color commands return to the frontend.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ColorSample {
    pub hex: String,
    pub rgb: Rgb,
    /// The sampled point, physical virtual-desktop pixels.
    pub x: i32,
    pub y: i32,
    /// Side of the averaged square (1 = single pixel).
    pub sample_size: u32,
    pub monitor: MonitorInfo,
    pub elapsed_ms: f64,
}

/// Color at (`x`, `y`), averaged over a `sample_size` square (clamped to
/// 1..=[`MAX_SAMPLE_SIZE`], rounded up to odd).
pub fn sample_point(
    source: &impl ScreenSource,
    x: i32,
    y: i32,
    sample_size: u32,
) -> Result<ColorSample, String> {
    let started = Instant::now();
    let size = sample_size.clamp(1, MAX_SAMPLE_SIZE) | 1;
    let monitor = source.monitor_at(x, y)?;
    let (lx, ly) = monitor.to_local(x, y);
    let region = sampler::region_around(lx, ly, size / 2, monitor.width, monitor.height)
        .ok_or_else(|| format!("Point {x},{y} is outside monitor {}", monitor.name))?;
    let image = source.capture(&monitor, region)?;
    // The centre in the captured image's own coordinates.
    let (cx, cy) = (lx - i64::from(region.x), ly - i64::from(region.y));
    let rgb = sampler::average(&image, cx, cy, size)
        .ok_or_else(|| "Captured image was empty".to_string())?;
    Ok(ColorSample {
        hex: rgb.hex(),
        rgb,
        x,
        y,
        sample_size: size,
        monitor,
        elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
    })
}

/// A full-resolution still of one monitor.
pub struct Frame {
    pub monitor: MonitorInfo,
    pub image: RgbaImage,
}

/// Capture every monitor, whole. Used to freeze the screen for the picker.
pub fn capture_all(source: &impl ScreenSource) -> Result<Vec<Frame>, String> {
    source
        .monitors()?
        .into_iter()
        .map(|monitor| {
            let full = Region {
                x: 0,
                y: 0,
                width: monitor.width,
                height: monitor.height,
            };
            let image = source.capture(&monitor, full)?;
            Ok(Frame { monitor, image })
        })
        .collect()
}

/// The whole monitor under the virtual-desktop point (`x`, `y`).
pub fn capture_monitor_at(source: &impl ScreenSource, x: i32, y: i32) -> Result<Frame, String> {
    let monitor = source.monitor_at(x, y)?;
    let full = Region {
        x: 0,
        y: 0,
        width: monitor.width,
        height: monitor.height,
    };
    let image = source.capture(&monitor, full)?;
    Ok(Frame { monitor, image })
}

/// [`ScreenSource`] backed by the `xcap` crate (GDI on Windows).
pub struct XcapSource;

impl XcapSource {
    fn find(x: i32, y: i32) -> Result<xcap::Monitor, String> {
        xcap::Monitor::from_point(x, y).map_err(|e| format!("No monitor at {x},{y}: {e}"))
    }
}

impl XcapSource {
    fn info(m: &xcap::Monitor) -> Result<MonitorInfo, String> {
        let err = |e: xcap::XCapError| e.to_string();
        Ok(MonitorInfo {
            name: m.friendly_name().or_else(|_| m.name()).unwrap_or_default(),
            x: m.x().map_err(err)?,
            y: m.y().map_err(err)?,
            width: m.width().map_err(err)?,
            height: m.height().map_err(err)?,
            scale_factor: m.scale_factor().unwrap_or(1.0),
        })
    }
}

impl ScreenSource for XcapSource {
    fn monitors(&self) -> Result<Vec<MonitorInfo>, String> {
        xcap::Monitor::all()
            .map_err(|e| format!("Could not list monitors: {e}"))?
            .iter()
            .map(Self::info)
            .collect()
    }

    fn monitor_at(&self, x: i32, y: i32) -> Result<MonitorInfo, String> {
        Self::info(&Self::find(x, y)?)
    }

    fn capture(&self, monitor: &MonitorInfo, region: Region) -> Result<RgbaImage, String> {
        Self::find(monitor.x, monitor.y)?
            .capture_region(region.x, region.y, region.width, region.height)
            .map_err(|e| format!("Screen capture failed: {e}"))
    }
}

/// Run a blocking capture off the async runtime's worker threads.
async fn run_blocking<T: Send + 'static>(
    f: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| e.to_string())?
}

/// Color at a physical virtual-desktop point.
#[tauri::command]
pub async fn color_at_point(
    x: i32,
    y: i32,
    sample_size: Option<u32>,
) -> Result<ColorSample, String> {
    run_blocking(move || sample_point(&XcapSource, x, y, sample_size.unwrap_or(1))).await
}

/// Color under the mouse cursor, wherever it is on the desktop.
#[tauri::command]
pub async fn color_at_cursor(
    app: tauri::AppHandle,
    sample_size: Option<u32>,
) -> Result<ColorSample, String> {
    let pos = app.cursor_position().map_err(|e| e.to_string())?;
    let (x, y) = (pos.x.floor() as i32, pos.y.floor() as i32);
    color_at_point(x, y, sample_size).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::Rgba;
    use std::cell::RefCell;

    /// Two monitors side by side: a 100% one at the origin and a 150% one to
    /// its left (negative x, as Windows reports it). Each pixel encodes its
    /// own monitor-local coordinates so we can see what was captured.
    struct Fake {
        monitors: Vec<MonitorInfo>,
        last_region: RefCell<Option<Region>>,
    }

    fn fake() -> Fake {
        let mon = |name: &str, x, y, width, height, scale_factor| MonitorInfo {
            name: name.into(),
            x,
            y,
            width,
            height,
            scale_factor,
        };
        Fake {
            monitors: vec![
                mon("Primary", 0, 0, 1920, 1080, 1.0),
                mon("Left", -2880, -200, 2880, 1620, 1.5),
            ],
            last_region: RefCell::new(None),
        }
    }

    impl ScreenSource for Fake {
        fn monitors(&self) -> Result<Vec<MonitorInfo>, String> {
            Ok(self.monitors.clone())
        }

        fn monitor_at(&self, x: i32, y: i32) -> Result<MonitorInfo, String> {
            self.monitors
                .iter()
                .find(|m| m.contains(x, y))
                .cloned()
                .ok_or_else(|| "no monitor".into())
        }

        fn capture(&self, _m: &MonitorInfo, r: Region) -> Result<RgbaImage, String> {
            *self.last_region.borrow_mut() = Some(r);
            Ok(RgbaImage::from_fn(r.width, r.height, |x, y| {
                let (gx, gy) = (r.x + x, r.y + y);
                Rgba([(gx % 256) as u8, (gy % 256) as u8, 7, 255])
            }))
        }
    }

    #[test]
    fn maps_point_to_primary_monitor() {
        let s = sample_point(&fake(), 300, 40, 1).unwrap();
        assert_eq!(s.monitor.name, "Primary");
        assert_eq!(s.rgb, Rgb::new(44, 40, 7));
        assert_eq!(s.hex, "#2C2807");
    }

    #[test]
    fn maps_negative_coordinates_to_left_monitor() {
        let src = fake();
        // Global (-2870, -190) is local (10, 10) on the left monitor.
        let s = sample_point(&src, -2870, -190, 1).unwrap();
        assert_eq!(s.monitor.name, "Left");
        assert_eq!(s.monitor.scale_factor, 1.5);
        assert_eq!(s.rgb, Rgb::new(10, 10, 7));
        assert_eq!(
            *src.last_region.borrow(),
            Some(Region {
                x: 10,
                y: 10,
                width: 1,
                height: 1
            })
        );
    }

    #[test]
    fn averages_and_clips_at_monitor_corner() {
        let src = fake();
        // Top-left pixel of the primary with a 3x3 average: only local
        // x 0..=1, y 0..=1 exist, so the mean is (0.5, 0.5) -> (1, 1).
        let s = sample_point(&src, 0, 0, 3).unwrap();
        assert_eq!(s.sample_size, 3);
        assert_eq!(s.rgb, Rgb::new(1, 1, 7));
        assert_eq!(
            *src.last_region.borrow(),
            Some(Region {
                x: 0,
                y: 0,
                width: 2,
                height: 2
            })
        );
    }

    #[test]
    fn clamps_sample_size() {
        let s = sample_point(&fake(), 500, 500, 1000).unwrap();
        assert_eq!(s.sample_size, MAX_SAMPLE_SIZE);
        let s = sample_point(&fake(), 500, 500, 0).unwrap();
        assert_eq!(s.sample_size, 1);
    }

    #[test]
    fn capture_all_grabs_each_monitor_whole() {
        let src = fake();
        let frames = capture_all(&src).unwrap();
        assert_eq!(frames.len(), 2);
        assert_eq!(frames[1].monitor.name, "Left");
        assert_eq!(frames[1].image.dimensions(), (2880, 1620));
    }

    #[test]
    fn capture_monitor_at_picks_the_monitor_under_the_point() {
        let src = fake();
        let frame = capture_monitor_at(&src, -100, 0).unwrap();
        assert_eq!(frame.monitor.name, "Left");
        assert_eq!(frame.image.dimensions(), (2880, 1620));
        assert!(capture_monitor_at(&src, 9000, 0).is_err());
    }

    #[test]
    fn point_off_every_monitor_is_an_error() {
        assert!(sample_point(&fake(), 5000, 5000, 1).is_err());
    }
}
