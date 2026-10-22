use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use serde::Serialize;

use crate::error::AppError;

const MAX_LOCAL_PATH_LENGTH: usize = 32_768;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalEntry {
    name: String,
    path: String,
    kind: &'static str,
    size: Option<u64>,
    modified_at: Option<u64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalDirectoryListing {
    path: Option<String>,
    parent_path: Option<String>,
    entries: Vec<LocalEntry>,
}

fn validate_path_text(path: &str) -> Result<(), AppError> {
    if path.is_empty() || path.len() > MAX_LOCAL_PATH_LENGTH || path.contains('\0') {
        return Err(AppError::Validation("Invalid local path".into()));
    }
    if !Path::new(path).is_absolute() {
        return Err(AppError::Validation("Local paths must be absolute".into()));
    }
    Ok(())
}

fn validate_entry_name(name: &str) -> Result<(), AppError> {
    if name.is_empty()
        || name.len() > 255
        || name == "."
        || name == ".."
        || name.contains(['/', '\\', '\0'])
    {
        return Err(AppError::Validation("Invalid local entry name".into()));
    }
    #[cfg(windows)]
    {
        let stem = name
            .split('.')
            .next()
            .unwrap_or_default()
            .to_ascii_uppercase();
        let reserved_device = matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
            || (stem.len() == 4
                && (stem.starts_with("COM") || stem.starts_with("LPT"))
                && matches!(stem.as_bytes()[3], b'1'..=b'9'));
        if name.ends_with(' ')
            || name.ends_with('.')
            || name.contains(['<', '>', ':', '"', '|', '?', '*'])
            || reserved_device
        {
            return Err(AppError::Validation(
                "Invalid Windows local entry name".into(),
            ));
        }
    }
    Ok(())
}

fn is_link_like(metadata: &std::fs::Metadata) -> bool {
    if metadata.file_type().is_symlink() {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;

        const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0400;
        metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
    }
    #[cfg(not(windows))]
    {
        false
    }
}

fn local_roots() -> Result<LocalDirectoryListing, AppError> {
    #[cfg(windows)]
    let entries = (b'A'..=b'Z')
        .filter_map(|letter| {
            let path = format!("{}:\\", letter as char);
            Path::new(&path).is_dir().then(|| LocalEntry {
                name: format!("{}:", letter as char),
                path,
                kind: "drive",
                size: None,
                modified_at: None,
            })
        })
        .collect();

    #[cfg(not(windows))]
    let entries = vec![LocalEntry {
        name: "/".into(),
        path: "/".into(),
        kind: "drive",
        size: None,
        modified_at: None,
    }];

    Ok(LocalDirectoryListing {
        path: None,
        parent_path: None,
        entries,
    })
}

fn list_directory(path: Option<&str>) -> Result<LocalDirectoryListing, AppError> {
    let Some(path) = path else {
        return local_roots();
    };
    validate_path_text(path)?;
    let directory = std::fs::canonicalize(path)?;
    if !directory.is_dir() {
        return Err(AppError::Validation(
            "Local path must be a directory".into(),
        ));
    }

    let mut entries = Vec::new();
    for item in std::fs::read_dir(&directory)? {
        let item = item?;
        let Some(name) = item.file_name().to_str().map(str::to_string) else {
            continue;
        };
        if validate_entry_name(&name).is_err() {
            continue;
        }
        let metadata = std::fs::symlink_metadata(item.path())?;
        let kind = if is_link_like(&metadata) {
            "symlink"
        } else if metadata.is_dir() {
            "directory"
        } else if metadata.is_file() {
            "file"
        } else {
            continue;
        };
        entries.push(LocalEntry {
            name,
            path: item.path().to_string_lossy().into_owned(),
            kind,
            size: metadata.is_file().then_some(metadata.len()),
            modified_at: metadata
                .modified()
                .ok()
                .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
                .map(|duration| duration.as_secs()),
        });
    }
    entries.sort_by(|first, second| {
        let first_rank = matches!(first.kind, "drive" | "directory") as u8;
        let second_rank = matches!(second.kind, "drive" | "directory") as u8;
        second_rank
            .cmp(&first_rank)
            .then_with(|| first.name.to_lowercase().cmp(&second.name.to_lowercase()))
    });

    let parent_path = directory
        .parent()
        .filter(|parent| *parent != directory)
        .map(|parent| parent.to_string_lossy().into_owned());
    Ok(LocalDirectoryListing {
        path: Some(directory.to_string_lossy().into_owned()),
        parent_path,
        entries,
    })
}

fn validated_parent_and_entry(path: &str) -> Result<(PathBuf, PathBuf), AppError> {
    validate_path_text(path)?;
    let raw = Path::new(path);
    let name = raw
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| AppError::Validation("Local entry has no valid name".into()))?;
    validate_entry_name(name)?;
    let parent = std::fs::canonicalize(
        raw.parent()
            .ok_or_else(|| AppError::Validation("Local entry has no parent".into()))?,
    )?;
    if !parent.is_dir() {
        return Err(AppError::Validation(
            "Local entry parent must be a directory".into(),
        ));
    }
    Ok((parent.clone(), parent.join(name)))
}

#[tauri::command]
pub async fn list_local_directory(path: Option<String>) -> Result<LocalDirectoryListing, AppError> {
    tauri::async_runtime::spawn_blocking(move || list_directory(path.as_deref()))
        .await
        .map_err(|error| AppError::Generic(format!("Local file task failed: {error}")))?
}

#[tauri::command]
pub async fn create_local_directory(path: String, name: String) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        validate_entry_name(&name)?;
        validate_path_text(&path)?;
        let parent = std::fs::canonicalize(path)?;
        if !parent.is_dir() {
            return Err(AppError::Validation(
                "Local parent must be a directory".into(),
            ));
        }
        let destination = parent.join(name);
        std::fs::create_dir(destination).map_err(|error| {
            if error.kind() == std::io::ErrorKind::AlreadyExists {
                AppError::Validation("A local entry already exists with that name".into())
            } else {
                error.into()
            }
        })?;
        Ok(())
    })
    .await
    .map_err(|error| AppError::Generic(format!("Local file task failed: {error}")))?
}

#[tauri::command]
pub async fn rename_local_entry(path: String, name: String) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        validate_entry_name(&name)?;
        let (parent, source) = validated_parent_and_entry(&path)?;
        std::fs::symlink_metadata(&source)?;
        let destination = parent.join(name);
        if destination.exists() {
            return Err(AppError::Validation(
                "A local entry already exists with that name".into(),
            ));
        }
        std::fs::rename(source, destination)?;
        Ok(())
    })
    .await
    .map_err(|error| AppError::Generic(format!("Local file task failed: {error}")))?
}

#[tauri::command]
pub async fn delete_local_entry(path: String) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        let (_, entry) = validated_parent_and_entry(&path)?;
        let metadata = std::fs::symlink_metadata(&entry)?;
        if is_link_like(&metadata) {
            return Err(AppError::Validation(
                "Symbolic links cannot be deleted from SessionDock".into(),
            ));
        }
        if metadata.is_dir() {
            if std::fs::read_dir(&entry)?.next().is_some() {
                return Err(AppError::Validation(
                    "Local directories must be empty before deletion".into(),
                ));
            }
            std::fs::remove_dir(entry)?;
        } else if metadata.is_file() {
            std::fs::remove_file(entry)?;
        } else {
            return Err(AppError::Validation("Unsupported local entry type".into()));
        }
        Ok(())
    })
    .await
    .map_err(|error| AppError::Generic(format!("Local file task failed: {error}")))?
}

#[cfg(test)]
mod tests {
    use super::{list_directory, validate_entry_name, validate_path_text};

    #[test]
    fn validates_local_paths_and_entry_names() {
        assert!(validate_path_text("relative/path").is_err());
        assert!(validate_entry_name("../escape").is_err());
        assert!(validate_entry_name("folder/name").is_err());
        assert!(validate_entry_name("config.txt").is_ok());
    }

    #[cfg(windows)]
    #[test]
    fn rejects_windows_device_and_stream_names() {
        assert!(validate_entry_name("CON").is_err());
        assert!(validate_entry_name("com1.txt").is_err());
        assert!(validate_entry_name("config:stream").is_err());
        assert!(validate_entry_name("trailing.").is_err());
        assert!(validate_entry_name("switch.cfg").is_ok());
    }

    #[test]
    fn lists_directories_before_files() {
        let root = std::env::temp_dir().join(format!("sessiondock-local-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&root).unwrap();
        std::fs::write(root.join("alpha.txt"), b"test").unwrap();
        std::fs::create_dir(root.join("zeta")).unwrap();

        let listing = list_directory(root.to_str()).unwrap();
        assert_eq!(listing.entries.len(), 2);
        assert_eq!(listing.entries[0].name, "zeta");
        assert_eq!(listing.entries[0].kind, "directory");
        assert_eq!(listing.entries[1].name, "alpha.txt");

        std::fs::remove_dir_all(root).unwrap();
    }
}
