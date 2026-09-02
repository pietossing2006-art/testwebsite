import http from 'node:http'
import { env } from './config/env.js'
import { createApp, corsOriginFn } from './app.js'
import { initDbPg, seedDb, processAutoClockOuts } from './db.js'
import { initSocketIO } from './lib/socket.js'
import { initTrackerStore } from './lib/trackerStore.js'
import { startDiscordBot } from './lib/discordBot.js'
import { logger } from './core/logger/index.js'

async function bootstrap() {
  try {
    logger.info('Initializing Database schema and migrations...')
    await initDbPg()
    await seedDb()
    logger.info('Database initialized successfully.')

    logger.info('Initializing Tracker Store and Discord Bot...')
    await Promise.all([initTrackerStore(), startDiscordBot()])

    const app = createApp()
    const httpServer = http.createServer(app)

    initSocketIO(httpServer, { origin: corsOriginFn, credentials: true })

    const port = env.PORT || 3001

    httpServer.listen(port, () => {
      logger.info(`Server listening on http://localhost:${port}`)

      // Auto clock-out checker every 30 seconds
      setInterval(() => {
        processAutoClockOuts().catch((err) => {
          logger.error('Auto clock-out error:', err)
        })
      }, 30_000)
    })

    const gracefulShutdown = async (signal) => {
      logger.info(`Received ${signal}, shutting down gracefully...`)
      httpServer.close(() => {
        logger.info('HTTP server closed.')
        process.exit(0)
      })
      setTimeout(() => {
        logger.error('Forcefully exiting after timeout...')
        process.exit(1)
      }, 10_000)
    }

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
    process.on('SIGINT', () => gracefulShutdown('SIGINT'))
  } catch (error) {
    logger.error('Bootstrap failed:', error)
    process.exit(1)
  }
}

bootstrap()
