// Flostruction — SMS Parse Tests
// Tests the inbound SMS reply parser (pure function, no DB).

import { describe, it, expect } from 'vitest';
import { parseSMSReply } from './parse';

const pendingCodes = ['ABC123', 'XYZ789', 'QRS456'];

describe('parseSMSReply', () => {
  // ─── YES ALL ────────────────────────────────────────────────────────────
  describe('YES ALL', () => {
    it('parses "YES ALL"', () => {
      const result = parseSMSReply('YES ALL', pendingCodes);
      expect(result.action).toBe('YES_ALL');
      expect(result.code).toBeNull();
    });

    it('parses "Y ALL"', () => {
      const result = parseSMSReply('Y ALL', pendingCodes);
      expect(result.action).toBe('YES_ALL');
    });

    it('parses "yes all" (case insensitive)', () => {
      const result = parseSMSReply('yes all', pendingCodes);
      expect(result.action).toBe('YES_ALL');
    });

    it('parses "  YES  ALL  " (extra whitespace)', () => {
      const result = parseSMSReply('  YES  ALL  ', pendingCodes);
      expect(result.action).toBe('YES_ALL');
    });

    it('parses bare "YES" when single pending shift', () => {
      const result = parseSMSReply('YES', ['ABC123']);
      expect(result.action).toBe('YES_ALL');
    });

    it('parses bare "Y" when single pending shift', () => {
      const result = parseSMSReply('Y', ['ABC123']);
      expect(result.action).toBe('YES_ALL');
    });

    it('does NOT parse bare "YES" as YES_ALL when multiple pending shifts', () => {
      const result = parseSMSReply('YES', pendingCodes);
      expect(result.action).toBe('UNKNOWN');
    });
  });

  // ─── YES [CODE] ────────────────────────────────────────────────────────
  describe('YES [CODE]', () => {
    it('parses "YES ABC123"', () => {
      const result = parseSMSReply('YES ABC123', pendingCodes);
      expect(result.action).toBe('YES_CODE');
      expect(result.code).toBe('ABC123');
    });

    it('parses "Y ABC123"', () => {
      const result = parseSMSReply('Y ABC123', pendingCodes);
      expect(result.action).toBe('YES_CODE');
      expect(result.code).toBe('ABC123');
    });

    it('parses case-insensitively "yes abc123"', () => {
      const result = parseSMSReply('yes abc123', pendingCodes);
      expect(result.action).toBe('YES_CODE');
      expect(result.code).toBe('ABC123');
    });

    it('parses minimum 4 chars of code', () => {
      const result = parseSMSReply('YES ABC1', pendingCodes);
      expect(result.action).toBe('YES_CODE');
      // Should partial match to ABC123
      expect(result.code).toBe('ABC123');
    });

    it('returns raw code when no match found', () => {
      const result = parseSMSReply('YES ZZZZZZ', pendingCodes);
      expect(result.action).toBe('YES_CODE');
      expect(result.code).toBe('ZZZZZZ');
    });
  });

  // ─── NO [CODE] ─────────────────────────────────────────────────────────
  describe('NO [CODE]', () => {
    it('parses "NO XYZ789"', () => {
      const result = parseSMSReply('NO XYZ789', pendingCodes);
      expect(result.action).toBe('NO_CODE');
      expect(result.code).toBe('XYZ789');
    });

    it('parses "N XYZ789"', () => {
      const result = parseSMSReply('N XYZ789', pendingCodes);
      expect(result.action).toBe('NO_CODE');
      expect(result.code).toBe('XYZ789');
    });

    it('parses case-insensitively "no xyz789"', () => {
      const result = parseSMSReply('no xyz789', pendingCodes);
      expect(result.action).toBe('NO_CODE');
      expect(result.code).toBe('XYZ789');
    });
  });

  // ─── HELP ──────────────────────────────────────────────────────────────
  describe('HELP', () => {
    it('parses "?"', () => {
      const result = parseSMSReply('?', pendingCodes);
      expect(result.action).toBe('HELP');
    });

    it('parses "HELP"', () => {
      const result = parseSMSReply('HELP', pendingCodes);
      expect(result.action).toBe('HELP');
    });

    it('parses "COMMANDS"', () => {
      const result = parseSMSReply('COMMANDS', pendingCodes);
      expect(result.action).toBe('HELP');
    });
  });

  // ─── UNKNOWN ───────────────────────────────────────────────────────────
  describe('UNKNOWN', () => {
    it('returns UNKNOWN for empty string', () => {
      const result = parseSMSReply('', pendingCodes);
      expect(result.action).toBe('UNKNOWN');
    });

    it('returns UNKNOWN for gibberish', () => {
      const result = parseSMSReply('hello world', pendingCodes);
      expect(result.action).toBe('UNKNOWN');
    });

    it('returns UNKNOWN for bare "YES" with multiple pending', () => {
      const result = parseSMSReply('YES', pendingCodes);
      expect(result.action).toBe('UNKNOWN');
    });

    it('preserves rawInput', () => {
      const result = parseSMSReply('what is this', pendingCodes);
      expect(result.rawInput).toBe('what is this');
    });
  });

  // ─── Joao test scenario ────────────────────────────────────────────────
  describe('Joao test scenario', () => {
    it('Joao shift approved via YES ALL', () => {
      // Supervisor has only Joao's clean shift pending
      const result = parseSMSReply('YES ALL', ['ABC123']);
      expect(result.action).toBe('YES_ALL');
    });

    it('Joao shift approved via YES [code]', () => {
      const result = parseSMSReply('YES ABC123', ['ABC123']);
      expect(result.action).toBe('YES_CODE');
      expect(result.code).toBe('ABC123');
    });
  });
});
