import { VBase } from '@vtex/api'
import { splitEvery } from 'ramda'

import {
  CONFIG_BUCKET,
  CONFIG_FILE,
  getBucket,
  hashString,
  TENANT_CACHE_TTL_S
} from '../../utils'
import {
  completeRoutes,
  createFileName,
  currentDate,
  CUSTOM_ROUTES_INDEX,
  DEFAULT_CONFIG,
  SitemapEntry,
  SitemapIndex,
} from './utils'

const CUSTOM_ROUTES_ENTITY = 'customRoutes'
const FILE_LIMIT = 5000

// Rutas por defecto que siempre se incluyen
const DEFAULT_CUSTOM_ROUTES = [
  '/contacto',
          '/institucional/politicas-privacidad',
          '/institucional/condiciones-despacho',
          '/institucional/cambios-garantias',
          '/institucional/terminos-condiciones',
          '/nosotros',
          '/calzado-de-seguridad/botines-de-seguridad/hombre',
          '/calzado-de-seguridad/botines-de-seguridad/mujer',
          '/calzado-de-seguridad/zapatos-de-seguridad/hombre',
          '/calzado-de-seguridad/zapatos-de-seguridad/mujer',
]

const saveRoutes = async (routes: string[], idx: number, bucket: string, vbase: VBase) => {
  const sitemapRoutes = routes.map(route => ({
    alternates: [],
    id: route,
    path: route,
  }))
  const entry = createFileName(CUSTOM_ROUTES_ENTITY, idx)
  await vbase.saveJSON<SitemapEntry>(bucket, entry, {
    lastUpdated: currentDate(),
    routes: sitemapRoutes,
  })
  return entry
}

export async function generateCustomRoutes(ctx: EventContext) {
  const { clients: { tenant, vbase, apps }, vtex: { logger }, state } = ctx

  // Obtener settings de state o desde apps si no existe
  let settings = state?.settings
  if (!settings) {
    const VTEX_APP_ID = process.env.VTEX_APP_ID!
    const VTEX_APP_AT_MAJOR = VTEX_APP_ID.replace(/@.*$/, '@0.x')
    settings = await apps.getAppSettings(VTEX_APP_AT_MAJOR)
  }

  const { bindings } = await tenant.info({
    forceMaxAge: TENANT_CACHE_TTL_S,
  })
  const { generationPrefix } = await vbase.getJSON<Config>(CONFIG_BUCKET, CONFIG_FILE, true) || DEFAULT_CONFIG

  // Combinar rutas por defecto con las rutas habilitadas en settings
  const allCustomRoutes = [...new Set([...DEFAULT_CUSTOM_ROUTES, ...(settings.enableRoutesTerm || [])])]
  // No aplicar filtro de disableRoutesTerm para customRoutes
  const filteredRoutes = allCustomRoutes

  await Promise.all(bindings.map(async binding => {
    const bucket = getBucket(generationPrefix, hashString(binding.id))
    const splittedRoutes = splitEvery(FILE_LIMIT, filteredRoutes)
    const index = await Promise.all(splittedRoutes.map((routes, idx) => saveRoutes(routes, idx, bucket, vbase)))
    await vbase.saveJSON<SitemapIndex>(bucket, CUSTOM_ROUTES_INDEX, {
      index,
      lastUpdated: currentDate(),
    })
  }))

  await completeRoutes(CUSTOM_ROUTES_INDEX, vbase)
  logger.info({
    message: 'Custom routes complete',
    numberOfroutes: filteredRoutes.length,
    type: 'custom-routes',
  })
}
