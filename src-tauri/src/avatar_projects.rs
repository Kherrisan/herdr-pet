use std::collections::HashSet;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use unicode_normalization::{UnicodeNormalization, char::is_combining_mark};

#[cfg(feature = "desktop")]
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
#[cfg(feature = "desktop")]
use tauri::{AppHandle, Manager};
#[cfg(feature = "desktop")]
use tempfile::NamedTempFile;

pub const MAX_PROJECT_BYTES: usize = 5 * 1024 * 1024;
const MAX_AVATARS: usize = 64;
const MAX_EXPRESSIONS: usize = 512;
const MAX_ANIMATIONS: usize = 256;
const MAX_STEPS_PER_ANIMATION: usize = 512;
const MAX_TOTAL_STEPS: usize = 8_192;
const MAX_STRING_BYTES: usize = 16 * 1024;
const MAX_DEPTH: usize = 32;
const INDEX_VERSION: u32 = 1;
const IMPORTER_VERSION: u32 = 1;

fn importer_version() -> u32 {
    IMPORTER_VERSION
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AvatarProjectAvatarSummary {
    pub id: String,
    pub name: String,
    pub animation_keys: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AvatarProjectInspection {
    pub version: u32,
    pub content_hash: String,
    pub size_bytes: usize,
    pub display_name: String,
    pub avatars: Vec<AvatarProjectAvatarSummary>,
    pub expression_count: usize,
    pub animation_count: usize,
    pub total_steps: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AvatarProjectFileInspection {
    pub source: String,
    pub file_name: String,
    pub inspection: AvatarProjectInspection,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AvatarInstallation {
    pub id: String,
    pub content_hash: String,
    pub imported_at_ms: u64,
    #[serde(default = "importer_version")]
    pub importer_version: u32,
    pub selected_avatar_id: String,
    pub summary: AvatarProjectInspection,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AvatarProjectSource {
    pub installation: AvatarInstallation,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AvatarIndex {
    version: u32,
    installations: Vec<AvatarInstallation>,
}

impl Default for AvatarIndex {
    fn default() -> Self {
        Self {
            version: INDEX_VERSION,
            installations: Vec::new(),
        }
    }
}

fn string_field<'a>(object: &'a Value, field: &str) -> Result<&'a str, String> {
    object
        .get(field)
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty() && value.len() <= 256)
        .ok_or_else(|| format!("invalid or missing {field}"))
}

fn animation_key(value: &Value, used: &mut HashSet<String>) -> String {
    let source = if value.get("builtIn").and_then(Value::as_bool) == Some(true) {
        value.get("id").and_then(Value::as_str)
    } else {
        value.get("name").and_then(Value::as_str)
    }
    .unwrap_or("animation");
    let mut base = String::new();
    let mut separator = false;
    for character in source
        .nfd()
        .filter(|character| !is_combining_mark(*character))
    {
        for lower in character.to_lowercase() {
            if lower.is_ascii_alphanumeric() {
                if separator && !base.is_empty() {
                    base.push('-');
                }
                separator = false;
                base.push(lower);
            } else {
                separator = true;
            }
        }
    }
    if base.is_empty() {
        base = "animation".into();
    }
    let mut key = base.clone();
    let mut suffix = 2;
    while used.contains(&key) {
        key = format!("{base}-{suffix}");
        suffix += 1;
    }
    used.insert(key.clone());
    key
}

fn validate_tree(value: &Value, depth: usize) -> Result<(), String> {
    if depth > MAX_DEPTH {
        return Err(format!("project nesting exceeds {MAX_DEPTH}"));
    }
    match value {
        Value::String(text) if text.len() > MAX_STRING_BYTES => {
            Err(format!("project string exceeds {MAX_STRING_BYTES} bytes"))
        }
        Value::Array(items) => {
            for item in items {
                validate_tree(item, depth + 1)?;
            }
            Ok(())
        }
        Value::Object(object) => {
            for (key, child) in object {
                if matches!(key.as_str(), "__proto__" | "prototype" | "constructor") {
                    return Err(format!("unsafe object key {key}"));
                }
                if key.len() > 256 {
                    return Err("project object key is too long".into());
                }
                validate_tree(child, depth + 1)?;
            }
            Ok(())
        }
        _ => Ok(()),
    }
}

fn sequence_stats(sequences: &[Value]) -> Result<(usize, usize), String> {
    if sequences.len() > MAX_ANIMATIONS {
        return Err(format!(
            "project contains more than {MAX_ANIMATIONS} animations"
        ));
    }
    let mut steps = 0;
    for sequence in sequences {
        let sequence_steps = sequence
            .get("steps")
            .and_then(Value::as_array)
            .ok_or("animation is missing steps")?;
        if sequence_steps.len() > MAX_STEPS_PER_ANIMATION {
            return Err(format!(
                "animation contains more than {MAX_STEPS_PER_ANIMATION} steps"
            ));
        }
        steps += sequence_steps.len();
        if steps > MAX_TOTAL_STEPS {
            return Err(format!(
                "project contains more than {MAX_TOTAL_STEPS} total steps"
            ));
        }
    }
    Ok((sequences.len(), steps))
}

pub fn inspect(source: &str) -> Result<AvatarProjectInspection, String> {
    if source.is_empty() {
        return Err("Avatar Studio project is empty".into());
    }
    if source.len() > MAX_PROJECT_BYTES {
        return Err(format!(
            "Avatar Studio project exceeds {MAX_PROJECT_BYTES} bytes"
        ));
    }
    let document: Value =
        serde_json::from_str(source).map_err(|error| format!("invalid JSON: {error}"))?;
    validate_tree(&document, 0)?;
    if document.get("version").and_then(Value::as_u64) != Some(2) {
        return Err("unsupported Avatar Studio project version".into());
    }
    let library = document
        .get("library")
        .and_then(Value::as_object)
        .ok_or("project is missing library")?;
    let avatars = library
        .get("avatars")
        .and_then(Value::as_array)
        .filter(|avatars| !avatars.is_empty())
        .ok_or("project contains no avatars")?;
    if avatars.len() > MAX_AVATARS {
        return Err(format!("project contains more than {MAX_AVATARS} avatars"));
    }
    let base_expressions = document
        .get("expressions")
        .and_then(Value::as_array)
        .filter(|expressions| !expressions.is_empty())
        .ok_or("project contains no expressions")?;
    if base_expressions.len() > MAX_EXPRESSIONS {
        return Err(format!(
            "project contains more than {MAX_EXPRESSIONS} expressions"
        ));
    }
    let base_sequences = document
        .get("sequences")
        .and_then(Value::as_array)
        .ok_or("project is missing animations")?;
    let (mut animation_count, mut total_steps) = sequence_stats(base_sequences)?;
    let mut expression_count = base_expressions.len();
    let mut seen_ids = HashSet::new();
    let mut summaries = Vec::with_capacity(avatars.len());

    for avatar in avatars {
        let id = string_field(avatar, "id")?.to_owned();
        if !seen_ids.insert(id.clone()) {
            return Err(format!("duplicate avatar id {id}"));
        }
        let name = string_field(avatar, "name")?.to_owned();
        let behavior = avatar.get("behavior").and_then(Value::as_object);
        let sequences = behavior
            .and_then(|behavior| behavior.get("sequences"))
            .and_then(Value::as_array)
            .unwrap_or(base_sequences);
        if let Some(expressions) = behavior
            .and_then(|behavior| behavior.get("expressions"))
            .and_then(Value::as_array)
        {
            if expressions.is_empty() || expressions.len() > MAX_EXPRESSIONS {
                return Err(format!("avatar {id} has an invalid expression library"));
            }
            expression_count += expressions.len();
        }
        if behavior.is_some() {
            let (count, steps) = sequence_stats(sequences)?;
            animation_count += count;
            total_steps += steps;
            if total_steps > MAX_TOTAL_STEPS {
                return Err(format!(
                    "project contains more than {MAX_TOTAL_STEPS} total steps"
                ));
            }
        }
        let mut used = HashSet::new();
        let animation_keys = sequences
            .iter()
            .map(|sequence| animation_key(sequence, &mut used))
            .collect();
        summaries.push(AvatarProjectAvatarSummary {
            id,
            name,
            animation_keys,
        });
    }
    if expression_count > MAX_EXPRESSIONS * MAX_AVATARS {
        return Err("project contains too many avatar-specific expressions".into());
    }
    let display_name = if summaries.len() == 1 {
        summaries[0].name.clone()
    } else {
        format!("{} + {}", summaries[0].name, summaries.len() - 1)
    };
    let content_hash = format!("{:x}", Sha256::digest(source.as_bytes()));
    Ok(AvatarProjectInspection {
        version: 2,
        content_hash,
        size_bytes: source.len(),
        display_name,
        avatars: summaries,
        expression_count,
        animation_count,
        total_steps,
    })
}

#[cfg(feature = "desktop")]
pub fn inspect_file(path: &Path) -> Result<AvatarProjectFileInspection, String> {
    let metadata = fs::metadata(path)
        .map_err(|error| format!("cannot access selected project file: {error}"))?;
    if !metadata.is_file() {
        return Err("selected Avatar Studio project is not a file".into());
    }
    if metadata.len() > MAX_PROJECT_BYTES as u64 {
        return Err(format!(
            "Avatar Studio project exceeds {MAX_PROJECT_BYTES} bytes"
        ));
    }
    let source = fs::read_to_string(path)
        .map_err(|error| format!("cannot read selected project file: {error}"))?;
    let inspection = inspect(&source)?;
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("avatar-project.json")
        .to_owned();
    Ok(AvatarProjectFileInspection {
        source,
        file_name,
        inspection,
    })
}

#[cfg(feature = "desktop")]
fn avatars_root(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join("avatars"))
        .map_err(|error| error.to_string())
}

#[cfg(feature = "desktop")]
fn valid_installation_id(id: &str) -> bool {
    id.len() == 64
        && id
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
}

#[cfg(feature = "desktop")]
fn installation_path_at(root: &Path, id: &str) -> Result<PathBuf, String> {
    if !valid_installation_id(id) {
        return Err("invalid avatar installation id".into());
    }
    Ok(root.join(id))
}

#[cfg(feature = "desktop")]
fn index_path_at(root: &Path) -> PathBuf {
    root.join("index.json")
}

#[cfg(feature = "desktop")]
fn read_index_at(root: &Path) -> Result<AvatarIndex, String> {
    let path = index_path_at(root);
    match fs::read(&path) {
        Ok(bytes) => {
            let parsed = serde_json::from_slice::<AvatarIndex>(&bytes);
            if let Ok(index) = parsed
                && index.version == INDEX_VERSION
            {
                return Ok(index);
            }
            let timestamp = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|duration| duration.as_secs())
                .unwrap_or_default();
            let backup = root.join(format!("index.backup-{timestamp}.json"));
            fs::rename(&path, backup).map_err(|error| error.to_string())?;
            let recovered = scan_installations(root)?;
            write_json_atomic(&path, &recovered)?;
            Ok(recovered)
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(AvatarIndex::default()),
        Err(error) => Err(error.to_string()),
    }
}

#[cfg(feature = "desktop")]
fn scan_installations(root: &Path) -> Result<AvatarIndex, String> {
    let mut installations = Vec::new();
    let entries = match fs::read_dir(root) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(AvatarIndex::default());
        }
        Err(error) => return Err(error.to_string()),
    };
    for entry in entries {
        let entry = entry.map_err(|error| error.to_string())?;
        let id = entry.file_name().to_string_lossy().into_owned();
        if !entry
            .file_type()
            .map_err(|error| error.to_string())?
            .is_dir()
            || !valid_installation_id(&id)
        {
            continue;
        }
        if let Ok(project) = get_at(root, &id) {
            installations.push(project.installation);
        }
    }
    installations.sort_by_key(|installation| std::cmp::Reverse(installation.imported_at_ms));
    Ok(AvatarIndex {
        version: INDEX_VERSION,
        installations,
    })
}

#[cfg(feature = "desktop")]
fn write_json_atomic(path: &Path, value: &impl Serialize) -> Result<(), String> {
    let parent = path.parent().ok_or("invalid avatar storage path")?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let mut temporary = NamedTempFile::new_in(parent).map_err(|error| error.to_string())?;
    serde_json::to_writer_pretty(&mut temporary, value).map_err(|error| error.to_string())?;
    temporary.flush().map_err(|error| error.to_string())?;
    temporary
        .as_file()
        .sync_all()
        .map_err(|error| error.to_string())?;
    temporary
        .persist(path)
        .map(|_| ())
        .map_err(|error| error.error.to_string())
}

#[cfg(feature = "desktop")]
fn save_index_at(root: &Path, index: &AvatarIndex) -> Result<(), String> {
    write_json_atomic(&index_path_at(root), index)
}

#[cfg(feature = "desktop")]
pub fn list(app: &AppHandle) -> Result<Vec<AvatarInstallation>, String> {
    read_index_at(&avatars_root(app)?).map(|index| index.installations)
}

#[cfg(feature = "desktop")]
pub fn install(
    app: &AppHandle,
    source: &str,
    avatar_id: &str,
) -> Result<AvatarInstallation, String> {
    install_at(&avatars_root(app)?, source, avatar_id)
}

#[cfg(feature = "desktop")]
fn install_at(root: &Path, source: &str, avatar_id: &str) -> Result<AvatarInstallation, String> {
    let summary = inspect(source)?;
    if !summary.avatars.iter().any(|avatar| avatar.id == avatar_id) {
        return Err(format!("avatar {avatar_id} does not exist in project"));
    }
    let id = summary.content_hash.clone();
    let target = installation_path_at(root, &id)?;
    let imported_at_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default();
    let installation = AvatarInstallation {
        id: id.clone(),
        content_hash: summary.content_hash.clone(),
        imported_at_ms,
        importer_version: IMPORTER_VERSION,
        selected_avatar_id: avatar_id.to_owned(),
        summary,
    };

    if !target.exists() {
        fs::create_dir_all(root).map_err(|error| error.to_string())?;
        let temporary = tempfile::Builder::new()
            .prefix("avatar-install-")
            .tempdir_in(root)
            .map_err(|error| error.to_string())?;
        let project_path = temporary.path().join("project.json");
        let mut project = fs::File::create(&project_path).map_err(|error| error.to_string())?;
        project
            .write_all(source.as_bytes())
            .and_then(|_| project.sync_all())
            .map_err(|error| error.to_string())?;
        write_json_atomic(&temporary.path().join("metadata.json"), &installation)?;
        fs::rename(temporary.path(), &target).map_err(|error| error.to_string())?;
    } else {
        write_json_atomic(&target.join("metadata.json"), &installation)?;
    }

    let mut index = read_index_at(root)?;
    index.installations.retain(|existing| existing.id != id);
    index.installations.push(installation.clone());
    index
        .installations
        .sort_by_key(|installation| std::cmp::Reverse(installation.imported_at_ms));
    save_index_at(root, &index)?;
    Ok(installation)
}

#[cfg(feature = "desktop")]
pub fn get(app: &AppHandle, id: &str) -> Result<AvatarProjectSource, String> {
    get_at(&avatars_root(app)?, id)
}

#[cfg(feature = "desktop")]
fn get_at(root: &Path, id: &str) -> Result<AvatarProjectSource, String> {
    let path = installation_path_at(root, id)?;
    let source =
        fs::read_to_string(path.join("project.json")).map_err(|error| error.to_string())?;
    let installation: AvatarInstallation = serde_json::from_slice(
        &fs::read(path.join("metadata.json")).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())?;
    if installation.id != id || installation.content_hash != id {
        return Err("installed Avatar metadata does not match its storage path".into());
    }
    if inspect(&source)?.content_hash != installation.content_hash {
        return Err("installed Avatar Studio project failed integrity validation".into());
    }
    Ok(AvatarProjectSource {
        installation,
        source,
    })
}

#[cfg(feature = "desktop")]
pub fn select(app: &AppHandle, id: &str, avatar_id: &str) -> Result<AvatarInstallation, String> {
    select_at(&avatars_root(app)?, id, avatar_id)
}

#[cfg(feature = "desktop")]
fn select_at(root: &Path, id: &str, avatar_id: &str) -> Result<AvatarInstallation, String> {
    let mut project = get_at(root, id)?;
    if !project
        .installation
        .summary
        .avatars
        .iter()
        .any(|avatar| avatar.id == avatar_id)
    {
        return Err(format!("avatar {avatar_id} does not exist in installation"));
    }
    project.installation.selected_avatar_id = avatar_id.to_owned();
    let path = installation_path_at(root, id)?;
    write_json_atomic(&path.join("metadata.json"), &project.installation)?;
    let mut index = read_index_at(root)?;
    let existing = index
        .installations
        .iter_mut()
        .find(|installation| installation.id == id)
        .ok_or("avatar installation is missing from index")?;
    *existing = project.installation.clone();
    save_index_at(root, &index)?;
    Ok(project.installation)
}

#[cfg(feature = "desktop")]
pub fn remove(app: &AppHandle, id: &str) -> Result<(), String> {
    remove_at(&avatars_root(app)?, id)
}

#[cfg(feature = "desktop")]
fn remove_at(root: &Path, id: &str) -> Result<(), String> {
    let target = installation_path_at(root, id)?;
    if target.exists() {
        fs::remove_dir_all(&target).map_err(|error| error.to_string())?;
    }
    let mut index = read_index_at(root)?;
    index
        .installations
        .retain(|installation| installation.id != id);
    save_index_at(root, &index)
}

#[cfg(test)]
mod tests {
    use super::*;

    const DEFAULT_PROJECT: &str =
        include_str!("../../third-party/avatar-lab/src/features/studio/defaultStudioDocument.json");

    #[test]
    fn inspects_the_official_studio_project() {
        let inspection = inspect(DEFAULT_PROJECT).unwrap();
        assert_eq!(inspection.version, 2);
        assert!(inspection.avatars.len() >= 2);
        assert_eq!(inspection.avatars[0].id, "strobi");
        assert!(
            inspection.avatars[0]
                .animation_keys
                .contains(&"idle".into())
        );
        assert!(
            inspection.avatars[0]
                .animation_keys
                .contains(&"celebrate".into())
        );
        assert_eq!(inspection.content_hash.len(), 64);
    }

    #[cfg(feature = "desktop")]
    #[test]
    fn reads_a_native_dialog_selection_on_the_backend() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("my-avatar.json");
        fs::write(&path, DEFAULT_PROJECT).unwrap();

        let selected = inspect_file(&path).unwrap();
        assert_eq!(selected.file_name, "my-avatar.json");
        assert_eq!(selected.source, DEFAULT_PROJECT);
        assert_eq!(selected.inspection.version, 2);
    }

    #[test]
    fn inspects_a_maximum_size_project_within_the_two_second_budget() {
        let mut source = DEFAULT_PROJECT.to_owned();
        source.push_str(&" ".repeat(MAX_PROJECT_BYTES - source.len()));
        assert_eq!(source.len(), MAX_PROJECT_BYTES);
        let started = std::time::Instant::now();
        let inspection = inspect(&source).unwrap();
        assert_eq!(inspection.size_bytes, MAX_PROJECT_BYTES);
        assert!(
            started.elapsed() < std::time::Duration::from_secs(2),
            "5 MiB inspection took {:?}",
            started.elapsed()
        );
    }

    #[test]
    fn rejects_unsupported_and_dangerous_projects() {
        assert!(
            inspect(r#"{"version":1}"#)
                .unwrap_err()
                .contains("unsupported")
        );
        assert!(
            inspect(r#"{"version":2,"__proto__":{},"library":{"avatars":[]}}"#)
                .unwrap_err()
                .contains("unsafe")
        );
    }

    #[test]
    fn matches_official_animation_slugging() {
        let mut used = HashSet::new();
        let first = serde_json::json!({"name": "Célébrer vite", "builtIn": false});
        let second = serde_json::json!({"name": "Célébrer vite", "builtIn": false});
        assert_eq!(animation_key(&first, &mut used), "celebrer-vite");
        assert_eq!(animation_key(&second, &mut used), "celebrer-vite-2");
    }

    #[cfg(feature = "desktop")]
    #[test]
    fn installs_selects_deduplicates_and_removes_on_disk() {
        let directory = tempfile::tempdir().unwrap();
        let root = directory.path().join("avatars");
        let first = install_at(&root, DEFAULT_PROJECT, "strobi").unwrap();
        let duplicate = install_at(&root, DEFAULT_PROJECT, "strobi").unwrap();
        assert_eq!(first.id, duplicate.id);
        assert_eq!(read_index_at(&root).unwrap().installations.len(), 1);
        assert!(root.join(&first.id).join("project.json").is_file());
        assert!(root.join(&first.id).join("metadata.json").is_file());
        assert!(fs::read_dir(&root).unwrap().all(|entry| {
            !entry
                .unwrap()
                .file_name()
                .to_string_lossy()
                .starts_with("avatar-install-")
        }));

        let other_avatar = first
            .summary
            .avatars
            .iter()
            .find(|avatar| avatar.id != "strobi")
            .unwrap();
        let selected = select_at(&root, &first.id, &other_avatar.id).unwrap();
        assert_eq!(selected.selected_avatar_id, other_avatar.id);
        assert_eq!(get_at(&root, &first.id).unwrap().installation, selected);

        remove_at(&root, &first.id).unwrap();
        assert!(!root.join(&first.id).exists());
        assert!(read_index_at(&root).unwrap().installations.is_empty());
    }

    #[cfg(feature = "desktop")]
    #[test]
    fn recovers_a_corrupt_index_from_valid_installation_metadata() {
        let directory = tempfile::tempdir().unwrap();
        let root = directory.path().join("avatars");
        let installed = install_at(&root, DEFAULT_PROJECT, "strobi").unwrap();
        fs::write(index_path_at(&root), b"{broken").unwrap();

        let recovered = read_index_at(&root).unwrap();
        assert_eq!(recovered.installations.len(), 1);
        assert_eq!(recovered.installations[0].id, installed.id);
        assert!(fs::read_dir(&root).unwrap().any(|entry| {
            entry
                .unwrap()
                .file_name()
                .to_string_lossy()
                .starts_with("index.backup-")
        }));
    }

    #[cfg(feature = "desktop")]
    #[test]
    fn rejects_path_escape_and_detects_installed_project_tampering() {
        let directory = tempfile::tempdir().unwrap();
        let root = directory.path().join("avatars");
        assert!(installation_path_at(&root, "../../escape").is_err());
        let installed = install_at(&root, DEFAULT_PROJECT, "strobi").unwrap();
        fs::write(root.join(&installed.id).join("project.json"), "{}").unwrap();
        assert!(get_at(&root, &installed.id).is_err());

        fs::write(index_path_at(&root), b"invalid").unwrap();
        assert!(read_index_at(&root).unwrap().installations.is_empty());
    }

    #[cfg(feature = "desktop")]
    #[test]
    fn invalid_projects_do_not_create_partial_storage() {
        let directory = tempfile::tempdir().unwrap();
        let root = directory.path().join("avatars");
        assert!(install_at(&root, r#"{"version":1}"#, "strobi").is_err());
        assert!(!root.exists());
    }
}
