import { Router } from 'express'
import authRoutes from './auth.js'
import meRoutes from './me.js'
import publicRoutes from './public.js'
import topupsRoutes from './topups.js'
import discordRoutes from './discord.js'
import growthRoutes from './growth.js'
import adminCoreRoutes from './admin-core.js'
import adminCatalogRoutes from './admin-catalog.js'
import adminOpsRoutes from './admin-ops.js'
import trackerRoutes from './tracker.js'

const apiRouter = Router()

apiRouter.use(authRoutes)
apiRouter.use(meRoutes)
apiRouter.use(publicRoutes)
apiRouter.use(topupsRoutes)
apiRouter.use(discordRoutes)
apiRouter.use(growthRoutes)
apiRouter.use(adminCoreRoutes)
apiRouter.use(adminCatalogRoutes)
apiRouter.use(adminOpsRoutes)
apiRouter.use('/api/tracker', trackerRoutes)

export default apiRouter
