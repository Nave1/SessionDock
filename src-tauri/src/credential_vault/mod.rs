mod platform;

pub use platform::PlatformVault;

use crate::error::AppError;

/// Trait defining the credential vault interface.
/// Implemented per platform (Windows Credential Manager, macOS Keychain).
pub trait CredentialVault {
    /// Store a secret value under the given key.
    fn store_secret(&self, key: &str, value: &str) -> Result<(), AppError>;

    /// Retrieve a secret value by key. Returns None if not found.
    fn get_secret(&self, key: &str) -> Result<Option<String>, AppError>;

    /// Delete a secret by key. No-op if not found.
    fn delete_secret(&self, key: &str) -> Result<(), AppError>;

    /// Check if a secret exists for the given key.
    fn has_secret(&self, key: &str) -> Result<bool, AppError>;
}

/// Get the platform credential vault instance.
pub fn get_vault() -> PlatformVault {
    PlatformVault
}
