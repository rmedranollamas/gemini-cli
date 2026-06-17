/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseArguments } from './config.js';
import { createTestMergedSettings } from './settings.js';
import { FatalConfigError } from '@google/gemini-cli-core';

describe('parseArguments mutual exclusivity', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const combinations = [
    ['--resume', '--session-id', 'test-id'],
    ['--resume', '--session-file', 'test.json'],
    ['--session-id', 'test-id', '--session-file', 'test.json'],
    ['--resume', '--session-id', 'test-id', '--session-file', 'test.json'],
  ];

  combinations.forEach((args) => {
    it(`should fail if ${args.filter((a) => a.startsWith('--')).join(' and ')} are provided`, async () => {
      process.argv = ['node', 'script.js', ...args];
      const mockConsoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      await expect(parseArguments(createTestMergedSettings())).rejects.toThrow(
        FatalConfigError,
      );

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining(
          'The flags --resume, --session-id, and --session-file are mutually exclusive. Please provide only one.',
        ),
      );
    });
  });
});
