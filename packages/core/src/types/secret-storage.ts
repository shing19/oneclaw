export interface SecretStore {
  set(key: string, value: string): Promise<void>;
  get(key: string): Promise<string | null>;
  delete(key: string): Promise<void>;
  has(key: string): Promise<boolean>;
  list(): Promise<string[]>;
}

export interface SecretMigration {
  migrate(from: SecretStore, to: SecretStore): Promise<MigrationReport>;
}

export interface MigrationReport {
  total: number;
  migrated: number;
  failed: string[];
}

export type SecretStoreErrorCode =
  | "STORE_UNAVAILABLE"
  | "SECRET_NOT_FOUND"
  | "DECRYPTION_FAILED"
  | "PERMISSION_DENIED";

export interface SecretStoreError extends Error {
  code: SecretStoreErrorCode;
}
