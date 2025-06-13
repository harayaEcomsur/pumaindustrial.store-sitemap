import * as cheerio from 'cheerio'

import { MultipleSitemapGenerationError } from '../errors'
import {
  EXTENDED_INDEX_FILE,
  getBucket,
  hashString,
  SitemapNotFound,
  startSitemapGeneration,
  xmlTruncateNodes,
} from '../utils'
import { currentDate, SitemapIndex } from './generateMiddlewares/utils'

const sitemapIndexEntry = (
  forwardedHost: string,
  rootPath: string,
  entry: string,
  lastUpdated: string,
  bindingAddress?: string
) => {
  const querystring = bindingAddress
    ? `?__bindingAddress=${bindingAddress}`
    : ''
  return `<sitemap>
      <loc>https://${forwardedHost}${rootPath}/sitemap/${entry}.xml${querystring}</loc>
      <lastmod>${lastUpdated}</lastmod>
    </sitemap>`
}

const sitemapBindingEntry = (
  host: string,
  lastUpdated: string,
  bindingAddress?: string
) => {
  const querystring = bindingAddress
    ? `?__bindingAddress=${bindingAddress}`
    : ''
  return `<sitemap>
      <loc>https://${host}/sitemap.xml${querystring}</loc>
      <lastmod>${lastUpdated}</lastmod>
    </sitemap>`
}

const sitemapIndex = async (ctx: Context) => {
  const {
    state: {
      binding,
      bindingAddress,
      bucket,
      enabledIndexFiles,
      forwardedHost,
      rootPath,
    },
    clients: { vbase },
  } = ctx

  ctx.vtex.logger.info({
    binding,
    bindingAddress,
    bucket,
    enabledIndexFiles,
    forwardedHost,
    message: 'Starting sitemapIndex',
    rootPath,
  })

  const $ = cheerio.load(
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    {
      xmlMode: true,
    }
  )

  try {
    const rawIndexFiles = await Promise.all([
      ...enabledIndexFiles.map(indexFile =>
        vbase.getJSON<SitemapIndex>(bucket, indexFile, true)
      ),
      vbase.getJSON<SitemapIndex>(
        getBucket('', hashString(binding.id)),
        EXTENDED_INDEX_FILE,
        true
      ),
    ])

    ctx.vtex.logger.info({
      message: 'Raw index files retrieved',
      rawIndexFiles,
    })

    const indexFiles = rawIndexFiles.filter(Boolean)

    if (indexFiles.length === 0) {
      ctx.vtex.logger.error({
        bindingId: binding.id,
        bucket,
        message: 'No index files found',
      })
      throw new SitemapNotFound('Sitemap not found')
    }

    const index = [
      ...new Set(
        indexFiles.reduce(
          (acc, { index: fileIndex }) => acc.concat(fileIndex),
          [] as string[]
        )
      ),
    ]

    const lastUpdated = indexFiles[0].lastUpdated

    const baseUrl = `https://${forwardedHost}${rootPath}`
    const baseEntry = `<url>
      <loc>${baseUrl}</loc>
      <lastmod>${lastUpdated}</lastmod>
    </url>`

    const indexXML = [
      baseEntry,
      ...index.map(entry =>
        sitemapIndexEntry(
          forwardedHost,
          rootPath,
          entry,
          lastUpdated,
          bindingAddress
        )
      )
    ]
    $('sitemapindex').append(xmlTruncateNodes(indexXML))
    return $
  } catch (error) {
    ctx.vtex.logger.error({
      error: error.message,
      message: 'Error in sitemapIndex',
      stack: error.stack,
    })
    throw error
  }
}

const sitemapBindingIndex = async (ctx: Context) => {
  const {
    state: { forwardedHost, matchingBindings: bindings },
    vtex: { production },
  } = ctx

  const $ = cheerio.load(
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    {
      xmlMode: true,
    }
  )

  const date = currentDate()
  const bindingsIndexXML = bindings.map(binding =>
    sitemapBindingEntry(
      production ? binding.canonicalBaseAddress : forwardedHost,
      date,
      production ? '' : binding.canonicalBaseAddress
    )
  )
  $('sitemapindex').append(xmlTruncateNodes(bindingsIndexXML))
  return $
}

export async function sitemap(ctx: Context, next: () => Promise<void>) {
  const {
    state: { matchingBindings, bindingAddress, rootPath, settings },
  } = ctx

  const hasBindingIdentifier = rootPath || bindingAddress
  let $: any
  try {
    if (hasBindingIdentifier || settings.ignoreBindings) {
      $ = await sitemapIndex(ctx)
    } else {
      const hasMultipleMatchingBindings = matchingBindings.length > 1
      $ = hasMultipleMatchingBindings
        ? await sitemapBindingIndex(ctx)
        : await sitemapIndex(ctx)
    }
  } catch (err) {
    if (err instanceof SitemapNotFound) {
      ctx.status = 404
      ctx.body = 'Generating sitemap...'
      ctx.vtex.logger.error(err.message)
      await startSitemapGeneration(ctx, true).catch(err => {
        if (!(err instanceof MultipleSitemapGenerationError)) {
          throw err
        }
      })
    }
    throw err
  }

  ctx.body = $.xml()
  next()
}
