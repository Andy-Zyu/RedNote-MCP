import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { BrowserManager } from '../browser/browserManager'
import { getGuard } from '../guard/apiKeyGuard'
import { startMatrixServer } from '../matrix'
import logger, { LOGS_DIR } from '../utils/logger'
import { createStdioLogger } from '../utils/stdioLogger'
import { SubscriptionMonitor } from '../monitor/subscriptionMonitor'
import { handleDegradation } from '../monitor/degradationHandler'
import { MONITOR_INTERVAL } from '../constants/timeouts'
import { registerAllTools } from '../tools/registration'

const name = 'rednote'
const version = '0.5.0'

// Create server instance
const server = new McpServer({
    name,
    version,
    protocolVersion: '2024-11-05',
    capabilities: {
        tools: true,
        sampling: {},
        roots: {
            listChanged: true
        }
    }
})

// Helper function to format uptime
function formatUptime(seconds: number): string {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    return `${hours}h ${minutes}m ${secs}s`
}

export async function startServer() {
    const startTime = Date.now()
    logger.info('Starting RedNote MCP Server', {
        pid: process.pid,
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch
    })

    // === Global Error Handlers ===
    process.on('uncaughtException', (error: Error) => {
        logger.error('Uncaught Exception - Server will continue running', {
            error: error.message,
            stack: error.stack,
            uptime: process.uptime()
        })
        // DO NOT exit - keep server running
    })

    process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
        logger.error('Unhandled Promise Rejection - Server will continue running', {
            reason: reason?.message || reason,
            stack: reason?.stack,
            promise: promise.toString(),
            uptime: process.uptime()
        })
        // DO NOT exit - keep server running
    })

    // === Heartbeat Logger ===
    const heartbeatInterval = setInterval(() => {
        const memUsage = process.memoryUsage()
        logger.info('MCP Server Heartbeat', {
            uptime: Math.floor(process.uptime()),
            uptimeFormatted: formatUptime(process.uptime()),
            memory: {
                rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
                heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
                heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`
            },
            pid: process.pid
        })
    }, MONITOR_INTERVAL.HEARTBEAT) // Every 60 seconds

    const guard = getGuard()
    if (guard.hasKey()) {
        logger.info('API Key configured, authentication enabled')
    } else {
        logger.warn('No PIGBUN_API_KEY found. Tools will require authentication.')
    }

    // Detect subscription mode and register tools dynamically
    let isMatrixMode = false
    try {
        const config = await guard.verifyAndGetConfig('mcp-startup')
        isMatrixMode = config.rednote.mode === 'matrix'
        logger.info(`Subscription mode: ${config.rednote.mode}, maxAccounts: ${config.rednote.maxAccounts}`)
    } catch (error) {
        logger.warn('Failed to verify subscription, falling back to personal mode', {
            error: error instanceof Error ? error.message : String(error)
        })
    }

    // Register tools with dynamic schema
    registerAllTools(server, isMatrixMode)
    logger.info(`Tools registered successfully (multi-account: ${isMatrixMode})`)

    // Register browser cleanup on process exit
    BrowserManager.registerProcessCleanup()

    // Start stdio logging
    const stopLogging = createStdioLogger(`${LOGS_DIR}/stdio.log`)

    // Wrap transport connection with error handling
    const transport = new StdioServerTransport()

    try {
        await server.connect(transport)
        const bootTime = Date.now() - startTime
        logger.info('RedNote MCP Server running on stdio', {
            bootTimeMs: bootTime,
            startedAt: new Date().toISOString()
        })
    } catch (error) {
        logger.error('Failed to connect MCP server transport', {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
        })
        throw error
    }

    // Auto-start Matrix server in background AFTER MCP server is running
    let matrixServer: any = null
    let isStartingMatrixServer = false
    let matrixServerHealthCheckInterval: NodeJS.Timeout | null = null
    let consecutiveFailures = 0
    const MAX_CONSECUTIVE_FAILURES = 3 // 连续失败3次才触发重启
    const HEALTH_CHECK_INTERVAL = 30000 // 30秒检查一次

    /**
     * 检查Matrix Server健康状态
     */
    async function checkMatrixServerHealth(): Promise<boolean> {
        try {
            const response = await fetch('http://localhost:3001/api/health', {
                signal: AbortSignal.timeout(5000) // 5秒超时
            })
            return response.ok
        } catch (error) {
            return false
        }
    }

    /**
     * 尝试启动Matrix Server（带重试）
     */
    async function tryStartMatrixServer(retries = 3): Promise<any> {
        if (isStartingMatrixServer) {
            logger.debug('Matrix server is already being started, skipping')
            return null
        }

        isStartingMatrixServer = true

        for (let i = 0; i < retries; i++) {
            try {
                logger.info(`Attempting to start Matrix server (attempt ${i + 1}/${retries})`)
                const server = await startMatrixServer(3001)
                isStartingMatrixServer = false
                consecutiveFailures = 0
                logger.info('Matrix server started successfully on http://localhost:3001')
                return server
            } catch (error: any) {
                if (error.code === 'EADDRINUSE') {
                    logger.debug('Matrix server already running on port 3001')
                    isStartingMatrixServer = false
                    return null
                }

                logger.warn(`Failed to start Matrix server (attempt ${i + 1}/${retries})`, {
                    error: error.message,
                    code: error.code
                })

                // 等待端口释放
                if (i < retries - 1) {
                    await new Promise(resolve => setTimeout(resolve, 2000))
                }
            }
        }

        isStartingMatrixServer = false
        logger.error('Failed to start Matrix server after all retries')
        return null
    }

    // 初始启动（仅 matrix 模式）
    if (isMatrixMode) {
        setImmediate(async () => {
            matrixServer = await tryStartMatrixServer()

            // 启动健康检查（仅在矩阵模式下）
            matrixServerHealthCheckInterval = setInterval(async () => {
                const isHealthy = await checkMatrixServerHealth()

                if (!isHealthy) {
                    consecutiveFailures++
                    logger.warn(`Matrix server health check failed (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES})`)

                    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                        logger.warn('Matrix server appears to be down, attempting to restart...')

                        // 清理旧的server引用
                        if (matrixServer) {
                            try {
                                matrixServer.close()
                            } catch (e) {
                                // Ignore
                            }
                            matrixServer = null
                        }

                        // 尝试重新启动
                        matrixServer = await tryStartMatrixServer()

                        if (matrixServer) {
                            logger.info('Matrix server successfully restarted')
                        } else {
                            logger.error('Failed to restart Matrix server, will retry on next health check')
                        }
                    }
                } else {
                    // 健康检查通过，重置失败计数
                    if (consecutiveFailures > 0) {
                        logger.info('Matrix server health check passed, resetting failure count')
                        consecutiveFailures = 0
                    }
                }
            }, HEALTH_CHECK_INTERVAL)

            logger.info('Matrix server health monitoring started (check every 30s)')
        })
    } else {
        logger.info('Personal mode detected, skip auto-starting Matrix server')
    }

    // Start subscription monitor
    const subscriptionMonitor = new SubscriptionMonitor()
    subscriptionMonitor.setModeChangeCallback((oldMode, newMode) => {
        logger.warn(`Subscription mode changed: ${oldMode} -> ${newMode}`)

        if (oldMode === 'matrix' && newMode === 'personal') {
            logger.warn('Subscription downgraded to personal mode', {
                action: 'Matrix features will be disabled',
                recommendation: 'Please upgrade your subscription to restore multi-account features'
            })

            // 触发降级处理
            handleDegradation(oldMode, newMode)

            // AccountHealthMonitor 会在 Matrix server 中自动停止
        } else if (oldMode === 'personal' && newMode === 'matrix') {
            logger.info('Subscription upgraded to matrix mode', {
                action: 'Multi-account features enabled'
            })
        }
    })
    subscriptionMonitor.start()

    // Cleanup on process exit
    process.on('exit', () => {
        logger.info('Process exiting', { uptime: process.uptime() })
        clearInterval(heartbeatInterval)
        if (matrixServerHealthCheckInterval) {
            clearInterval(matrixServerHealthCheckInterval)
        }
        stopLogging()
        subscriptionMonitor.stop()
        if (matrixServer) {
            try {
                matrixServer.close()
            } catch (e) {
                // Ignore cleanup errors
            }
        }
    })

    process.on('SIGINT', () => {
        logger.info('Received SIGINT, shutting down gracefully')
        clearInterval(heartbeatInterval)
        if (matrixServerHealthCheckInterval) {
            clearInterval(matrixServerHealthCheckInterval)
        }
        subscriptionMonitor.stop()
        if (matrixServer) {
            try {
                matrixServer.close()
            } catch (e) {
                // Ignore cleanup errors
            }
        }
        process.exit(0)
    })

    process.on('SIGTERM', () => {
        logger.info('Received SIGTERM, shutting down gracefully')
        clearInterval(heartbeatInterval)
        if (matrixServerHealthCheckInterval) {
            clearInterval(matrixServerHealthCheckInterval)
        }
        subscriptionMonitor.stop()
        if (matrixServer) {
            try {
                matrixServer.close()
            } catch (e) {
                // Ignore cleanup errors
            }
        }
        process.exit(0)
    })
}
