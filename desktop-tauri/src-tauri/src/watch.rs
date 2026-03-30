use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::{
  fs,
  path::{Path, PathBuf},
  sync::{mpsc, Mutex},
  thread,
  time::Duration,
};
use tauri::{AppHandle, Emitter, Manager};

pub const DEFAULT_BATCH_DIRECTORY: &str = "../../database/batch-records";
pub const SNAPSHOT_EVENT: &str = "desktop://batch-directory-snapshot";
const WATCH_DEBOUNCE_MS: u64 = 250;

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchDirectoryFile {
  pub path: String,
  pub content: String,
}

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchDirectoryReadError {
  pub path: String,
  pub error: String,
}

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchDirectorySnapshot {
  pub data_dir: String,
  pub files: Vec<BatchDirectoryFile>,
  pub read_errors: Vec<BatchDirectoryReadError>,
  pub scanned_at: String,
}

pub struct BatchDirectoryState {
  pub snapshot: Mutex<BatchDirectorySnapshot>,
}

impl Default for BatchDirectoryState {
  fn default() -> Self {
    Self {
      snapshot: Mutex::new(BatchDirectorySnapshot {
        data_dir: default_batch_directory().display().to_string(),
        ..BatchDirectorySnapshot::default()
      }),
    }
  }
}

fn now_iso_string() -> String {
  format!("{:?}", std::time::SystemTime::now())
}

pub fn default_batch_directory() -> PathBuf {
  let path = Path::new(env!("CARGO_MANIFEST_DIR")).join(DEFAULT_BATCH_DIRECTORY);
  fs::canonicalize(&path).unwrap_or(path)
}

fn read_snapshot_from_directory(directory: &Path) -> BatchDirectorySnapshot {
  let mut snapshot = BatchDirectorySnapshot {
    data_dir: directory.display().to_string(),
    files: Vec::new(),
    read_errors: Vec::new(),
    scanned_at: now_iso_string(),
  };

  let mut file_paths = match fs::read_dir(directory) {
    Ok(entries) => entries
      .filter_map(|entry| entry.ok().map(|item| item.path()))
      .filter(|path| {
        path.is_file()
          && path
            .extension()
            .and_then(|value| value.to_str())
            .map(|value| value.eq_ignore_ascii_case("json"))
            .unwrap_or(false)
      })
      .collect::<Vec<_>>(),
    Err(error) => {
      snapshot.read_errors.push(BatchDirectoryReadError {
        path: directory.display().to_string(),
        error: error.to_string(),
      });
      return snapshot;
    }
  };

  file_paths.sort();

  for path in file_paths {
    match fs::read_to_string(&path) {
      Ok(content) => snapshot.files.push(BatchDirectoryFile {
        path: path.display().to_string(),
        content,
      }),
      Err(error) => snapshot.read_errors.push(BatchDirectoryReadError {
        path: path.display().to_string(),
        error: error.to_string(),
      }),
    }
  }

  snapshot
}

pub fn refresh_batch_directory_snapshot(app: &AppHandle) -> Result<BatchDirectorySnapshot, String> {
  let data_dir = default_batch_directory();
  fs::create_dir_all(&data_dir).map_err(|error| error.to_string())?;

  let snapshot = read_snapshot_from_directory(&data_dir);
  let state = app.state::<BatchDirectoryState>();
  let mut guard = state.snapshot.lock().map_err(|_| "目录状态锁定失败".to_string())?;
  *guard = snapshot.clone();
  drop(guard);

  app
    .emit(SNAPSHOT_EVENT, snapshot.clone())
    .map_err(|error| error.to_string())?;

  Ok(snapshot)
}

pub fn initialize_batch_directory_state(app: &AppHandle) -> Result<(), String> {
  let watch_path = default_batch_directory();
  fs::create_dir_all(&watch_path).map_err(|error| error.to_string())?;
  refresh_batch_directory_snapshot(app)?;

  let app_handle = app.clone();
  thread::spawn(move || {
    let (tx, rx) = mpsc::channel();

    let mut watcher = match RecommendedWatcher::new(
      move |result| {
        let _ = tx.send(result);
      },
      Config::default(),
    ) {
      Ok(watcher) => watcher,
      Err(error) => {
        eprintln!("watcher init failed: {error}");
        return;
      }
    };

    if let Err(error) = watcher.watch(&watch_path, RecursiveMode::NonRecursive) {
      eprintln!("watcher start failed: {error}");
      return;
    }

    while rx.recv().is_ok() {
      while rx
        .recv_timeout(Duration::from_millis(WATCH_DEBOUNCE_MS))
        .is_ok()
      {}

      if let Err(error) = refresh_batch_directory_snapshot(&app_handle) {
        eprintln!("watch refresh failed: {error}");
      }
    }
  });

  Ok(())
}
