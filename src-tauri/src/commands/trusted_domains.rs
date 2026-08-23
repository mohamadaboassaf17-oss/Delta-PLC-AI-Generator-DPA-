//! Tauri commands for managing the trusted-domains list.
//!
//! The list is persisted to `<app_data_dir>/trusted_domains.json` by
//! the `providers::domain_trust` module. These commands are thin
//! wrappers that resolve the path and forward to the pure functions.

use tauri::AppHandle;

use crate::error::AppError;
use crate::paths;
use crate::providers::domain_trust::{
    read_trusted_domains_file, trusted_domains_path, write_trusted_domains_file, TrustedDomain,
};

fn list_path(app: &AppHandle) -> Result<std::path::PathBuf, AppError> {
    Ok(trusted_domains_path(&paths::app_data_dir(app)?))
}

#[tauri::command]
pub fn trusted_domains_list(app: AppHandle) -> Result<Vec<TrustedDomain>, AppError> {
    let path = list_path(&app)?;
    let list = read_trusted_domains_file(&path)?;
    Ok(list.list())
}

#[tauri::command]
pub fn trusted_domains_add(domain: String, app: AppHandle) -> Result<(), AppError> {
    let path = list_path(&app)?;
    let mut list = read_trusted_domains_file(&path)?;
    list.add(&domain);
    write_trusted_domains_file(&path, &list)
}

#[tauri::command]
pub fn trusted_domains_remove(domain: String, app: AppHandle) -> Result<(), AppError> {
    let path = list_path(&app)?;
    let mut list = read_trusted_domains_file(&path)?;
    list.remove(&domain);
    write_trusted_domains_file(&path, &list)
}

#[tauri::command]
pub fn trusted_domains_is_trusted(domain: String, app: AppHandle) -> Result<bool, AppError> {
    let path = list_path(&app)?;
    let list = read_trusted_domains_file(&path)?;
    Ok(list.is_trusted(&domain))
}
