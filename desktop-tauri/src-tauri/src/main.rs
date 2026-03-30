mod tray;
mod watch;

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

#[tauri::command]
fn get_batch_directory_snapshot(
  app: AppHandle,
) -> Result<watch::BatchDirectorySnapshot, String> {
  let state = app.state::<watch::BatchDirectoryState>();
  let guard = state
    .snapshot
    .lock()
    .map_err(|_| "目录状态锁定失败".to_string())?;
  Ok(guard.clone())
}

#[tauri::command]
fn refresh_batch_directory_snapshot(
  app: AppHandle,
) -> Result<watch::BatchDirectorySnapshot, String> {
  watch::refresh_batch_directory_snapshot(&app)
}

fn build_panel_window(app: &tauri::App) -> tauri::Result<()> {
  if app.get_webview_window("panel").is_some() {
    return Ok(());
  }

  WebviewWindowBuilder::new(app, "panel", WebviewUrl::App("index.html".into()))
    .title("积存金收益看板")
    .inner_size(420.0, 580.0)
    .resizable(false)
    .visible(false)
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .build()?;

  Ok(())
}

fn main() {
  tauri::Builder::default()
    .manage(watch::BatchDirectoryState::default())
    .invoke_handler(tauri::generate_handler![
      get_batch_directory_snapshot,
      refresh_batch_directory_snapshot
    ])
    .setup(|app| {
      build_panel_window(app)?;
      if let Err(error) = watch::initialize_batch_directory_state(app.handle()) {
        eprintln!("watch setup failed: {error}");
      }
      tray::build_tray(app)?;
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("failed to run gold watch panel");
}
