use crate::credential_vault::CredentialVault;
use crate::error::AppError;

/// Platform-agnostic credential vault interface.
/// On Windows: uses Windows Credential Manager via `keyring` crate.
/// On macOS: uses macOS Keychain via `keyring` crate.
pub struct PlatformVault;

impl PlatformVault {
    const SERVICE_NAME: &'static str = "sessiondock";

    fn entry(key: &str) -> Result<keyring::Entry, AppError> {
        keyring::Entry::new(Self::SERVICE_NAME, key)
            .map_err(|error| AppError::CredentialVault(error.to_string()))
    }
}

impl CredentialVault for PlatformVault {
    fn store_secret(&self, key: &str, value: &str) -> Result<(), AppError> {
        let entry = Self::entry(key)?;
        entry
            .set_password(value)
            .map_err(|error| AppError::CredentialVault(error.to_string()))?;
        drop(entry);

        match Self::entry(key)?.get_password() {
            Ok(stored) if stored == value => Ok(()),
            Ok(_) => {
                let _ = Self::entry(key)?.delete_credential();
                Err(AppError::CredentialVault(
                    "The operating-system vault did not preserve the saved secret".into(),
                ))
            }
            Err(error) => {
                let _ = Self::entry(key)?.delete_credential();
                Err(AppError::CredentialVault(format!(
                    "The operating-system vault could not read the saved secret: {error}"
                )))
            }
        }
    }

    fn get_secret(&self, key: &str) -> Result<Option<String>, AppError> {
        let entry = Self::entry(key)?;
        match entry.get_password() {
            Ok(password) => Ok(Some(password)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(AppError::CredentialVault(e.to_string())),
        }
    }

    fn delete_secret(&self, key: &str) -> Result<(), AppError> {
        let entry = Self::entry(key)?;
        match entry.delete_credential() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(AppError::CredentialVault(e.to_string())),
        }
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::{CredentialVault, PlatformVault};

    #[test]
    fn persists_a_secret_across_vault_instances() {
        let key = format!("test_{}", uuid::Uuid::new_v4());
        let secret = "sessiondock-vault-round-trip";

        PlatformVault.store_secret(&key, secret).unwrap();
        assert_eq!(
            PlatformVault.get_secret(&key).unwrap().as_deref(),
            Some(secret)
        );
        PlatformVault.delete_secret(&key).unwrap();
        assert_eq!(PlatformVault.get_secret(&key).unwrap(), None);
    }
}
