import { appIdToAppAtMajor } from '@vtex/api'
import {
  APPS_ROUTES_INDEX,
  CUSTOM_ROUTES_INDEX,
  PRODUCT_ROUTES_INDEX,
  REWRITER_ROUTES_INDEX,
} from './generateMiddlewares/utils'

export interface Settings {
  disableRoutesTerm: string[]
  enableAppsRoutes: boolean
  enableNavigationRoutes: boolean
  enableProductRoutes: boolean
  enableRoutesTerm: string[]
  ignoreBindings: boolean
}

const VTEX_APP_ID = process.env.VTEX_APP_ID!
const VTEX_APP_AT_MAJOR = appIdToAppAtMajor(VTEX_APP_ID)

const DEFAULT_SETTINGS = {
  disableRoutesTerm: [],
  enableAppsRoutes: true,
  enableNavigationRoutes: true,
  enableProductRoutes: true,
  enableRoutesTerm: [],
  ignoreBindings: false,
}

const INDEX_MAP = {
  disableRoutesTerm: '',
  enableAppsRoutes: APPS_ROUTES_INDEX,
  enableNavigationRoutes: REWRITER_ROUTES_INDEX,
  enableProductRoutes: PRODUCT_ROUTES_INDEX,
  enableRoutesTerm: CUSTOM_ROUTES_INDEX,
  ignoreBindings: '',
}

export async function settings(
  ctx: Context | EventContext,
  next: () => Promise<void>
) {
  const {
    clients: { apps },
  } = ctx

  const appSettings: Settings = {
    ...DEFAULT_SETTINGS,
    ...(await apps.getAppSettings(VTEX_APP_AT_MAJOR)),
  }
  const keys = Object.keys(appSettings) as Array<keyof Settings>
  const enabledIndexFiles = keys.reduce((acc, key) => {
    if (appSettings[key] && INDEX_MAP[key]) {
      acc.push(INDEX_MAP[key])
    }
    return acc
  }, [] as string[])

  // Siempre incluir rutas personalizadas
  if (!enabledIndexFiles.includes(CUSTOM_ROUTES_INDEX)) {
    enabledIndexFiles.push(CUSTOM_ROUTES_INDEX)
  }

  ctx.state = {
    ...ctx.state,
    enabledIndexFiles,
    settings: appSettings,
  }

  await next()
}
