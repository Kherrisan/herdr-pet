use std::{
    io,
    path::{Path, PathBuf},
    pin::Pin,
};

use tokio::io::{AsyncRead, AsyncWrite};

pub trait AsyncStream: AsyncRead + AsyncWrite + Unpin + Send {}
impl<T> AsyncStream for T where T: AsyncRead + AsyncWrite + Unpin + Send {}

pub type BoxStream = Pin<Box<dyn AsyncStream>>;

#[derive(Debug, Clone)]
enum EndpointTarget {
    Local(PathBuf),
    Wsl {
        distribution: Option<String>,
        socket_path: Option<String>,
        session: Option<String>,
    },
}

#[derive(Debug, Clone)]
pub struct Endpoint {
    target: EndpointTarget,
    display: String,
    session_id: String,
}

impl Endpoint {
    pub fn local(path: PathBuf, session_id: &str) -> Self {
        Self {
            display: path.to_string_lossy().into_owned(),
            target: EndpointTarget::Local(path),
            session_id: session_id.into(),
        }
    }

    pub fn wsl(
        distribution: Option<String>,
        socket_path: Option<String>,
        session: Option<String>,
    ) -> Self {
        let distribution_label = distribution.as_deref().unwrap_or("default");
        let socket_label = socket_path
            .clone()
            .unwrap_or_else(|| match session.as_deref() {
                Some(session) => format!("~/.config/herdr/sessions/{session}/herdr.sock"),
                None => "~/.config/herdr/herdr.sock".into(),
            });
        let session_id = session.clone().unwrap_or_else(|| "default".into());
        Self {
            display: format!("wsl://{distribution_label}/{socket_label}"),
            target: EndpointTarget::Wsl {
                distribution,
                socket_path,
                session,
            },
            session_id,
        }
    }

    #[cfg(test)]
    pub fn path(&self) -> PathBuf {
        match &self.target {
            EndpointTarget::Local(path) => path.clone(),
            EndpointTarget::Wsl { .. } => PathBuf::from(&self.display),
        }
    }

    pub fn display(&self) -> &str {
        &self.display
    }

    pub fn session_id(&self) -> &str {
        &self.session_id
    }
}

pub async fn connect(endpoint: &Endpoint) -> io::Result<BoxStream> {
    match &endpoint.target {
        EndpointTarget::Local(path) => connect_local(path).await,
        EndpointTarget::Wsl {
            distribution,
            socket_path,
            session,
        } => {
            connect_wsl(
                distribution.as_deref(),
                socket_path.as_deref(),
                session.as_deref(),
            )
            .await
        }
    }
}

async fn connect_local(path: &Path) -> io::Result<BoxStream> {
    use interprocess::local_socket::tokio::{Stream, prelude::*};

    #[cfg(unix)]
    let name = {
        use interprocess::local_socket::{GenericFilePath, prelude::*};
        path.to_fs_name::<GenericFilePath>()?
    };
    #[cfg(windows)]
    let name = {
        use interprocess::local_socket::{GenericNamespaced, prelude::*};
        path.to_string_lossy()
            .to_string()
            .to_ns_name::<GenericNamespaced>()?
    };
    let stream = Stream::connect(name).await?;
    Ok(Box::pin(stream))
}

#[cfg(windows)]
const WSL_RELAY_SCRIPT: &str = r#"
socket=$1
session=$2
if [ -z "$socket" ]; then
  if [ -n "${HERDR_SOCKET_PATH:-}" ]; then
    socket=$HERDR_SOCKET_PATH
  else
    base=${XDG_CONFIG_HOME:-"$HOME/.config"}/herdr
    if [ -n "$session" ]; then
      socket=$base/sessions/$session/herdr.sock
    else
      socket=$base/herdr.sock
    fi
  fi
fi
case "$socket" in
  '~/'*) socket="$HOME/${socket#\~/}" ;;
esac
if command -v nc >/dev/null 2>&1; then
  exec nc -U "$socket"
fi
printf '%s\n' '{"error":{"code":"wsl_bridge_unavailable","message":"Herdr Pet WSL mode requires nc with Unix-socket support. Install netcat-openbsd in WSL."}}'
exit 127
"#;

#[cfg(windows)]
struct WslStream {
    child: tokio::process::Child,
    stdin: tokio::process::ChildStdin,
    stdout: tokio::process::ChildStdout,
}

#[cfg(windows)]
impl AsyncRead for WslStream {
    fn poll_read(
        self: Pin<&mut Self>,
        context: &mut std::task::Context<'_>,
        buffer: &mut tokio::io::ReadBuf<'_>,
    ) -> std::task::Poll<io::Result<()>> {
        Pin::new(&mut self.get_mut().stdout).poll_read(context, buffer)
    }
}

#[cfg(windows)]
impl AsyncWrite for WslStream {
    fn poll_write(
        self: Pin<&mut Self>,
        context: &mut std::task::Context<'_>,
        buffer: &[u8],
    ) -> std::task::Poll<Result<usize, io::Error>> {
        Pin::new(&mut self.get_mut().stdin).poll_write(context, buffer)
    }

    fn poll_flush(
        self: Pin<&mut Self>,
        context: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Result<(), io::Error>> {
        Pin::new(&mut self.get_mut().stdin).poll_flush(context)
    }

    fn poll_shutdown(
        self: Pin<&mut Self>,
        context: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Result<(), io::Error>> {
        Pin::new(&mut self.get_mut().stdin).poll_shutdown(context)
    }
}

#[cfg(windows)]
impl Drop for WslStream {
    fn drop(&mut self) {
        let _ = self.child.start_kill();
    }
}

#[cfg(windows)]
async fn connect_wsl(
    distribution: Option<&str>,
    socket_path: Option<&str>,
    session: Option<&str>,
) -> io::Result<BoxStream> {
    use std::process::Stdio;
    use tokio::io::AsyncReadExt as _;

    let mut command = tokio::process::Command::new("wsl.exe");
    if let Some(distribution) = distribution {
        command.args(["--distribution", distribution]);
    }
    command
        .args(["--exec", "/bin/sh", "-lc", WSL_RELAY_SCRIPT])
        .arg("herdr-pet-bridge")
        .arg(socket_path.unwrap_or_default())
        .arg(session.unwrap_or_default())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    use std::os::windows::process::CommandExt as _;
    command.as_std_mut().creation_flags(0x0800_0000);

    let mut child = command.spawn().map_err(|error| {
        if error.kind() == io::ErrorKind::NotFound {
            io::Error::new(
                error.kind(),
                "wsl.exe was not found; enable Windows Subsystem for Linux",
            )
        } else {
            error
        }
    })?;
    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| io::Error::other("failed to open WSL bridge stdin"))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| io::Error::other("failed to open WSL bridge stdout"))?;
    if let Some(mut stderr) = child.stderr.take() {
        tokio::spawn(async move {
            let mut message = String::new();
            if stderr.read_to_string(&mut message).await.is_ok() && !message.trim().is_empty() {
                tracing::warn!(message = message.trim(), "WSL bridge reported an error");
            }
        });
    }
    Ok(Box::pin(WslStream {
        child,
        stdin,
        stdout,
    }))
}

#[cfg(not(windows))]
async fn connect_wsl(
    _distribution: Option<&str>,
    _socket_path: Option<&str>,
    _session: Option<&str>,
) -> io::Result<BoxStream> {
    Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "WSL mode is only available in the Windows build of Herdr Pet",
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_wsl_endpoint_without_exposing_a_windows_pipe() {
        let endpoint = Endpoint::wsl(Some("Ubuntu-24.04".into()), None, Some("work".into()));
        assert_eq!(
            endpoint.display(),
            "wsl://Ubuntu-24.04/~/.config/herdr/sessions/work/herdr.sock"
        );
        assert_eq!(endpoint.session_id(), "work");
    }

    #[tokio::test]
    #[cfg(not(windows))]
    async fn rejects_wsl_transport_outside_windows() {
        let endpoint = Endpoint::wsl(None, None, None);
        let error = match connect(&endpoint).await {
            Ok(_) => panic!("WSL transport must not connect outside Windows"),
            Err(error) => error,
        };
        assert_eq!(error.kind(), io::ErrorKind::Unsupported);
    }
}
