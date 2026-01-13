/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockedObject,
} from 'vitest';
import { McpClientManager } from './mcp-client-manager.js';
import { McpClient, MCPDiscoveryState } from './mcp-client.js';
import type { ToolRegistry } from './tool-registry.js';
import type { Config } from '../config/config.js';

vi.mock('./mcp-client.js', async () => {
  const originalModule = await vi.importActual('./mcp-client.js');
  return {
    ...originalModule,
    McpClient: vi.fn(),
  };
});

describe('McpClientManager', () => {
  let mockedMcpClient: MockedObject<McpClient>;
  let mockConfig: MockedObject<Config>;
  let toolRegistry: ToolRegistry;

  beforeEach(() => {
    mockedMcpClient = vi.mockObject({
      connect: vi.fn(),
      discover: vi.fn(),
      disconnect: vi.fn(),
      getStatus: vi.fn(),
      getServerConfig: vi.fn(),
    } as unknown as McpClient);
    vi.mocked(McpClient).mockReturnValue(mockedMcpClient);
    mockConfig = vi.mockObject({
      isTrustedFolder: vi.fn().mockReturnValue(true),
      getMcpServers: vi.fn().mockReturnValue({}),
      getPromptRegistry: () => {},
      getResourceRegistry: () => {},
      getDebugMode: () => false,
      getWorkspaceContext: () => {},
      getAllowedMcpServers: vi.fn().mockReturnValue([]),
      getBlockedMcpServers: vi.fn().mockReturnValue([]),
      getMcpServerCommand: vi.fn().mockReturnValue(''),
      getMcpEnablementCallbacks: vi.fn().mockReturnValue(undefined),
      getGeminiClient: vi.fn().mockReturnValue({
        isInitialized: vi.fn(),
      }),
      refreshMcpContext: vi.fn(),
      getMcpAutoRestartConfig: vi.fn().mockReturnValue({
        enabled: false,
      }),
    } as unknown as Config);
    toolRegistry = {} as ToolRegistry;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should discover tools from all configured', async () => {
    mockConfig.getMcpServers.mockReturnValue({
      'test-server': {},
    });
    const manager = new McpClientManager('0.0.1', toolRegistry, mockConfig);
    await manager.startConfiguredMcpServers();
    expect(mockedMcpClient.connect).toHaveBeenCalledOnce();
    expect(mockedMcpClient.discover).toHaveBeenCalledOnce();
    expect(mockConfig.refreshMcpContext).toHaveBeenCalledOnce();
  });

  it('should batch context refresh when starting multiple servers', async () => {
    mockConfig.getMcpServers.mockReturnValue({
      'server-1': {},
      'server-2': {},
      'server-3': {},
    });
    const manager = new McpClientManager('0.0.1', toolRegistry, mockConfig);
    await manager.startConfiguredMcpServers();

    // Each client should be connected/discovered
    expect(mockedMcpClient.connect).toHaveBeenCalledTimes(3);
    expect(mockedMcpClient.discover).toHaveBeenCalledTimes(3);

    // But context refresh should happen only once
    expect(mockConfig.refreshMcpContext).toHaveBeenCalledOnce();
  });

  it('should update global discovery state', async () => {
    mockConfig.getMcpServers.mockReturnValue({
      'test-server': {},
    });
    const manager = new McpClientManager('0.0.1', toolRegistry, mockConfig);
    expect(manager.getDiscoveryState()).toBe(MCPDiscoveryState.NOT_STARTED);
    const promise = manager.startConfiguredMcpServers();
    expect(manager.getDiscoveryState()).toBe(MCPDiscoveryState.IN_PROGRESS);
    await promise;
    expect(manager.getDiscoveryState()).toBe(MCPDiscoveryState.COMPLETED);
  });

  it('should not discover tools if folder is not trusted', async () => {
    mockConfig.getMcpServers.mockReturnValue({
      'test-server': {},
    });
    mockConfig.isTrustedFolder.mockReturnValue(false);
    const manager = new McpClientManager('0.0.1', toolRegistry, mockConfig);
    await manager.startConfiguredMcpServers();
    expect(mockedMcpClient.connect).not.toHaveBeenCalled();
    expect(mockedMcpClient.discover).not.toHaveBeenCalled();
  });

  it('should not start blocked servers', async () => {
    mockConfig.getMcpServers.mockReturnValue({
      'test-server': {},
    });
    mockConfig.getBlockedMcpServers.mockReturnValue(['test-server']);
    const manager = new McpClientManager('0.0.1', toolRegistry, mockConfig);
    await manager.startConfiguredMcpServers();
    expect(mockedMcpClient.connect).not.toHaveBeenCalled();
    expect(mockedMcpClient.discover).not.toHaveBeenCalled();
  });

  it('should only start allowed servers if allow list is not empty', async () => {
    mockConfig.getMcpServers.mockReturnValue({
      'test-server': {},
      'another-server': {},
    });
    mockConfig.getAllowedMcpServers.mockReturnValue(['another-server']);
    const manager = new McpClientManager('0.0.1', toolRegistry, mockConfig);
    await manager.startConfiguredMcpServers();
    expect(mockedMcpClient.connect).toHaveBeenCalledOnce();
    expect(mockedMcpClient.discover).toHaveBeenCalledOnce();
  });

  it('should start servers from extensions', async () => {
    const manager = new McpClientManager('0.0.1', toolRegistry, mockConfig);
    await manager.startExtension({
      name: 'test-extension',
      mcpServers: {
        'test-server': {},
      },
      isActive: true,
      version: '1.0.0',
      path: '/some-path',
      contextFiles: [],
      id: '123',
    });
    expect(mockedMcpClient.connect).toHaveBeenCalledOnce();
    expect(mockedMcpClient.discover).toHaveBeenCalledOnce();
  });

  it('should not start servers from disabled extensions', async () => {
    const manager = new McpClientManager('0.0.1', toolRegistry, mockConfig);
    await manager.startExtension({
      name: 'test-extension',
      mcpServers: {
        'test-server': {},
      },
      isActive: false,
      version: '1.0.0',
      path: '/some-path',
      contextFiles: [],
      id: '123',
    });
    expect(mockedMcpClient.connect).not.toHaveBeenCalled();
    expect(mockedMcpClient.discover).not.toHaveBeenCalled();
  });

  it('should add blocked servers to the blockedMcpServers list', async () => {
    mockConfig.getMcpServers.mockReturnValue({
      'test-server': {},
    });
    mockConfig.getBlockedMcpServers.mockReturnValue(['test-server']);
    const manager = new McpClientManager('0.0.1', toolRegistry, mockConfig);
    await manager.startConfiguredMcpServers();
    expect(manager.getBlockedMcpServers()).toEqual([
      { name: 'test-server', extensionName: '' },
    ]);
  });

  describe('restart', () => {
    it('should restart all running servers', async () => {
      mockConfig.getMcpServers.mockReturnValue({
        'test-server': {},
      });
      mockedMcpClient.getServerConfig.mockReturnValue({});
      const manager = new McpClientManager('0.0.1', toolRegistry, mockConfig);
      await manager.startConfiguredMcpServers();

      expect(mockedMcpClient.connect).toHaveBeenCalledTimes(1);
      expect(mockedMcpClient.discover).toHaveBeenCalledTimes(1);
      await manager.restart();

      expect(mockedMcpClient.disconnect).toHaveBeenCalledTimes(1);
      expect(mockedMcpClient.connect).toHaveBeenCalledTimes(2);
      expect(mockedMcpClient.discover).toHaveBeenCalledTimes(2);
    });
  });

  describe('restartServer', () => {
    it('should restart the specified server', async () => {
      mockConfig.getMcpServers.mockReturnValue({
        'test-server': {},
      });
      mockedMcpClient.getServerConfig.mockReturnValue({});
      const manager = new McpClientManager('0.0.1', toolRegistry, mockConfig);
      await manager.startConfiguredMcpServers();

      expect(mockedMcpClient.connect).toHaveBeenCalledTimes(1);
      expect(mockedMcpClient.discover).toHaveBeenCalledTimes(1);

      await manager.restartServer('test-server');

      expect(mockedMcpClient.disconnect).toHaveBeenCalledTimes(1);
      expect(mockedMcpClient.connect).toHaveBeenCalledTimes(2);
      expect(mockedMcpClient.discover).toHaveBeenCalledTimes(2);
    });

    it('should throw an error if the server does not exist', async () => {
      const manager = new McpClientManager('0.0.1', toolRegistry, mockConfig);
      await expect(manager.restartServer('non-existent')).rejects.toThrow(
        'No MCP server registered with the name "non-existent"',
      );
    });
  });

  describe('getMcpInstructions', () => {
    it('should not return instructions for servers that do not have instructions', async () => {
      vi.mocked(McpClient).mockImplementation(
        (name, config) =>
          ({
            connect: vi.fn(),
            discover: vi.fn(),
            disconnect: vi.fn(),
            getServerConfig: vi.fn().mockReturnValue(config),
            getInstructions: vi
              .fn()
              .mockReturnValue(
                name === 'server-with-instructions'
                  ? `Instructions for ${name}`
                  : '',
              ),
          }) as unknown as McpClient,
      );

      const manager = new McpClientManager(
        '0.0.1',
        {} as ToolRegistry,
        mockConfig,
      );

      mockConfig.getMcpServers.mockReturnValue({
        'server-with-instructions': {},
        'server-without-instructions': {},
      });
      await manager.startConfiguredMcpServers();

      const instructions = manager.getMcpInstructions();

      expect(instructions).toContain(
        "The following are instructions provided by the tool server 'server-with-instructions':",
      );
      expect(instructions).toContain('---[start of server instructions]---');
      expect(instructions).toContain(
        'Instructions for server-with-instructions',
      );
      expect(instructions).toContain('---[end of server instructions]---');

      expect(instructions).not.toContain(
        "The following are instructions provided by the tool server 'server-without-instructions':",
      );
    });
  });

  describe('Promise rejection handling', () => {
    it('should handle errors thrown during client initialization', async () => {
      vi.mocked(McpClient).mockImplementation(() => {
        throw new Error('Client initialization failed');
      });

      mockConfig.getMcpServers.mockReturnValue({
        'test-server': {},
      });

      const manager = new McpClientManager(
        '0.0.1',
        {} as ToolRegistry,
        mockConfig,
      );

      await expect(manager.startConfiguredMcpServers()).resolves.not.toThrow();
    });

    it('should handle errors thrown in the async IIFE before try block', async () => {
      let disconnectCallCount = 0;
      mockedMcpClient.disconnect.mockImplementation(async () => {
        disconnectCallCount++;
        if (disconnectCallCount === 1) {
          throw new Error('Disconnect failed unexpectedly');
        }
      });
      mockedMcpClient.getServerConfig.mockReturnValue({});

      mockConfig.getMcpServers.mockReturnValue({
        'test-server': {},
      });

      const manager = new McpClientManager(
        '0.0.1',
        {} as ToolRegistry,
        mockConfig,
      );
      await manager.startConfiguredMcpServers();

      await expect(manager.restartServer('test-server')).resolves.not.toThrow();
    });
  });

  describe('health check', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should restart unresponsive servers and prevent concurrent restarts', async () => {
      mockConfig.getMcpAutoRestartConfig.mockReturnValue({
        enabled: true,
        healthCheckIntervalMs: 1000,
        unhealthyTimeoutMs: 5000,
      });

      const manager = new McpClientManager('0.0.1', toolRegistry, mockConfig);

      mockConfig.getMcpServers.mockReturnValue({
        'test-server': {},
      });
      mockedMcpClient.getServerConfig.mockReturnValue({});

      // Mock maybeDiscoverMcpServer (via restartServer) to take some time
      let resolveRestart: () => void;
      const restartPromise = new Promise<void>((resolve) => {
        resolveRestart = resolve;
      });

      // We need to spy on the manager's restartServer or just check calls to connect/disconnect
      // Since maybeDiscoverMcpServer is private, we'll check mockedMcpClient calls.
      // However, restartServer calls maybeDiscoverMcpServer which creates a new client if needed.
      // In this test, it will reuse the existing mockedMcpClient because we mocked McpClient constructor.

      await manager.startConfiguredMcpServers();

      // Reset mocks after initial discovery
      mockedMcpClient.disconnect.mockClear();
      mockedMcpClient.connect.mockClear();

      // Mock disconnect to be slow
      mockedMcpClient.disconnect.mockReturnValue(restartPromise);

      // Trigger health check by advancing time
      // 1. Initial health update happens on connect
      // 2. Advance time past unhealthyTimeoutMs
      await vi.advanceTimersByTimeAsync(6000);

      // First health check should have triggered restart
      expect(mockedMcpClient.disconnect).toHaveBeenCalledTimes(1);

      // Trigger another health check while first one is still "running" (disconnect not resolved)
      await vi.advanceTimersByTimeAsync(1000);

      // Should NOT have triggered another restart
      expect(mockedMcpClient.disconnect).toHaveBeenCalledTimes(1);

      // Resolve first restart
      resolveRestart!();
      // Allow async microtasks to finish (including the async IIFE in maybeDiscoverMcpServer)
      for (let i = 0; i < 10; i++) await Promise.resolve();

      // After resolving, another health check should be able to trigger it again if still unhealthy
      // but we need to advance time again past the unhealthy timeout
      await vi.advanceTimersByTimeAsync(6000);
      expect(mockedMcpClient.disconnect).toHaveBeenCalledTimes(2);
    });
  });
});
