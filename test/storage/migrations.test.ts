/**
 * Tests for the database migration system.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { CerberusDB } from '../../src/storage/database.js';
import { getCurrentVersion, applyMigrations, MIGRATIONS } from '../../src/storage/migrations.js';

describe('Database Migrations', () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cerberus-migration-'));
    dbPath = path.join(tmpDir, 'test.db');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('applies initial migration on fresh database', async () => {
    const db = await CerberusDB.create(dbPath);

    // Database should be usable
    const runId = db.createRun({
      ci_run_id: 'migration-test',
      commit_sha: 'sha1',
      branch: 'main',
      triggered_at: new Date().toISOString(),
    });
    expect(runId).toBeGreaterThan(0);

    // Check version is at least the latest migration
    const version = getCurrentVersion(db.getDb());
    expect(version).toBe(MIGRATIONS[MIGRATIONS.length - 1].version);

    db.close();
  });

  it('does not re-apply migrations on existing database', async () => {
    // Create database
    const db1 = await CerberusDB.create(dbPath);
    db1.close();

    // Reopen — should not fail
    const db2 = await CerberusDB.create(dbPath);
    const version = getCurrentVersion(db2.getDb());
    expect(version).toBe(MIGRATIONS[MIGRATIONS.length - 1].version);
    db2.close();
  });

  it('all migrations are applied in order', async () => {
    const db = await CerberusDB.create(dbPath);
    const version = getCurrentVersion(db.getDb());
    expect(version).toBe(MIGRATIONS[MIGRATIONS.length - 1].version);
    db.close();
  });

  it('schema_migrations table records applied migrations', async () => {
    const db = await CerberusDB.create(dbPath);

    const result = db.getDb().exec(
      'SELECT version, name FROM schema_migrations ORDER BY version',
    );
    expect(result[0].values.length).toBe(MIGRATIONS.length);
    expect(result[0].values[0][0]).toBe(1);
    expect(result[0].values[0][1]).toBe('initial-schema');

    db.close();
  });

  it('indexes are created', async () => {
    const db = await CerberusDB.create(dbPath);

    const result = db.getDb().exec(
      "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'",
    );
    // Should have multiple indexes
    expect(result[0].values.length).toBeGreaterThan(5);

    db.close();
  });
});
