use crate::credential_vault::CredentialVault;
use crate::error::AppError;

/// Platform-agnostic credential vault interface.
/// On Windows: uses Windows Credential Manager via `keyring` crate.
/// On macOS: uses macOS Keychain via `keyring` crate.
pub struct PlatformVault;

impl PlatformVault {
    const SERVICE_NAME: &'static str = "sessiondock";
}

impl CredentialVault for PlatformVault {
    fn store_secret(&self, key: &str, value: &str) -> Result<(), AppError> {
        let entry = keyring::Entry::new(Self::SERVICE_NAME, key)
            .map_err(|e| AppError::CredentialVault(e.to_string()))?;
        entry
            .set_password(value)
            .map_err(|e| AppError::CredentialVault(e.to_string()))?;
        Ok(())
    }

    fn get_secret(&self, key: &str) -> Result<Option<String>, AppError> {
        let entry = keyring::Entry::new(Self::SERVICE_NAME, key)
            .map_err(|e| AppError::CredentialVault(e.to_string()))?;
        match entry.get_password() {
            Ok(password) => Ok(Some(password)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(AppError::CredentialVault(e.to_string())),
        }
    }

    fn delete_secret(&self, key: &str) -> Result<(), AppError> {
        let entry = keyring::Entry::new(Self::SERVICE_NAME, key)
            .map_err(|e| AppError::CredentialVault(e.to_string()))?;
        match entry.delete_credential() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(AppError::CredentialVault(e.to_string())),
        }
    }

    fn has_secret(&self, key: &str) -> Result<bool, AppError> {
        let entry = keyring::Entry::new(Self::SERVICE_NAME, key)
            .map_err(|e| AppError::CredentialVault(e.to_string()))?;
        match entry.get_password() {
            Ok(_) => Ok(true),
            Err(keyring::Error::NoEntry) => Ok(false),
            Err(e) => Err(AppError::CredentialVault(e.to_string())),
        }
    }
}
