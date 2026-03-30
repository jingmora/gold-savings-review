use tauri::{
  image::Image,
  menu::{MenuBuilder, MenuItemBuilder},
  tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
  App, AppHandle, Manager, PhysicalPosition, Position, Rect, Size, WebviewWindow,
};

use crate::watch;

const PANEL_WINDOW_LABEL: &str = "panel";
const MENU_REFRESH: &str = "refresh";
const MENU_QUIT: &str = "quit";
const PANEL_VERTICAL_OFFSET: i32 = 10;

fn position_panel_window(window: &WebviewWindow, anchor: Rect) -> tauri::Result<()> {
  let size = window.outer_size()?;
  let (anchor_x, anchor_y) = match anchor.position {
    Position::Physical(position) => (position.x as i32, position.y as i32),
    Position::Logical(position) => (position.x as i32, position.y as i32),
  };
  let (anchor_width, anchor_height) = match anchor.size {
    Size::Physical(size) => (size.width as i32, size.height as i32),
    Size::Logical(size) => (size.width as i32, size.height as i32),
  };
  let x = anchor_x + (anchor_width / 2) - (size.width as i32 / 2);
  let y = anchor_y + anchor_height + PANEL_VERTICAL_OFFSET;

  window.set_position(Position::Physical(PhysicalPosition::new(x.max(0), y.max(0))))?;
  Ok(())
}

fn toggle_panel_window(app: &AppHandle, anchor: Rect) -> tauri::Result<()> {
  let Some(window) = app.get_webview_window(PANEL_WINDOW_LABEL) else {
    return Ok(());
  };

  if window.is_visible()? {
    window.hide()?;
    return Ok(());
  }

  position_panel_window(&window, anchor)?;
  window.show()?;
  window.set_focus()?;

  Ok(())
}

pub fn build_tray(app: &App) -> tauri::Result<()> {
  let refresh = MenuItemBuilder::with_id(MENU_REFRESH, "立即刷新").build(app)?;
  let quit = MenuItemBuilder::with_id(MENU_QUIT, "退出").build(app)?;
  let menu = MenuBuilder::new(app).item(&refresh).item(&quit).build()?;
  let icon = Image::from_bytes(include_bytes!("../icons/tray-template.png"))?;

  TrayIconBuilder::with_id("gold-watch-panel")
    .menu(&menu)
    .icon(icon)
    .show_menu_on_left_click(false)
    .on_menu_event(|app, event| match event.id().as_ref() {
      MENU_REFRESH => {
        let _ = watch::refresh_batch_directory_snapshot(app);
      }
      MENU_QUIT => app.exit(0),
      _ => {}
    })
    .on_tray_icon_event(|tray, event| {
      if let TrayIconEvent::Click {
        button: MouseButton::Left,
        button_state: MouseButtonState::Up,
        rect,
        ..
      } = event
      {
        let _ = toggle_panel_window(&tray.app_handle(), rect);
      }
    })
    .build(app)?;

  Ok(())
}
