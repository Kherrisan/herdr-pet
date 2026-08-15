use std::path::PathBuf;

use crate::config::HerdrConfig;

use super::transport::Endpoint;

pub fn discover(config: &HerdrConfig) -> Endpoint {
    if config.wsl.enabled {
        return Endpoint::wsl(
            config.wsl.distribution.clone(),
            config.socket_path.clone(),
            config.session.clone(),
        );
    }
    if let Some(path) = config.socket_path.as_deref() {
        return Endpoint::local(
            PathBuf::from(path),
            config.session.as_deref().unwrap_or("custom"),
        );
    }
    if let Ok(path) = std::env::var("HERDR_SOCKET_PATH") {
        return Endpoint::local(
            PathBuf::from(path),
            config.session.as_deref().unwrap_or("env"),
        );
    }
    let session = config
        .session
        .clone()
        .or_else(|| std::env::var("HERDR_SESSION").ok());
    let base = herdr_config_dir();
    let path = match session.as_deref() {
        Some(name) => base.join("sessions").join(name).join("herdr.sock"),
        None => base.join("herdr.sock"),
    };
    Endpoint::local(path, session.as_deref().unwrap_or("default"))
}

fn herdr_config_dir() -> PathBuf {
    if let Ok(path) = std::env::var("XDG_CONFIG_HOME") {
        return PathBuf::from(path).join("herdr");
    }
    #[cfg(windows)]
    if let Ok(path) = std::env::var("APPDATA") {
        return PathBuf::from(path).join("herdr");
    }
    dirs::home_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join(".config")
        .join("herdr")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn explicit_socket_path_wins() {
        let endpoint = discover(&HerdrConfig {
            auto_discover: true,
            session: Some("work".into()),
            socket_path: Some("/tmp/custom-herdr.sock".into()),
            ..HerdrConfig::default()
        });
        assert_eq!(endpoint.path(), PathBuf::from("/tmp/custom-herdr.sock"));
        assert_eq!(endpoint.session_id(), "work");
    }

    #[test]
    fn wsl_mode_keeps_linux_discovery_inside_the_selected_distribution() {
        let mut config = HerdrConfig::default();
        config.wsl.enabled = true;
        config.wsl.distribution = Some("Ubuntu".into());
        config.session = Some("work".into());
        let endpoint = discover(&config);
        assert_eq!(
            endpoint.display(),
            "wsl://Ubuntu/~/.config/herdr/sessions/work/herdr.sock"
        );
    }
}
