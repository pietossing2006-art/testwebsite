const DEFAULT_SITE_URL = 'https://www.vxpers.com'

function ensureMeta(attrName, attrValue) {
  if (typeof document === 'undefined') return null
  const selector = `meta[${attrName}='${attrValue}']`
  let tag = document.head.querySelector(selector)
  if (!tag) {
    tag = document.createElement('meta')
    tag.setAttribute(attrName, attrValue)
    document.head.appendChild(tag)
  }
  return tag
}

function setMetaByName(name, content) {
  const tag = ensureMeta('name', name)
  if (tag) tag.setAttribute('content', content)
}

function setMetaByProperty(property, content) {
  const tag = ensureMeta('property', property)
  if (tag) tag.setAttribute('content', content)
}

function setCanonical(canonicalUrl) {
  if (typeof document === 'undefined') return
  let link = document.head.querySelector("link[rel='canonical']")
  if (!link) {
    link = document.createElement('link')
    link.setAttribute('rel', 'canonical')
    document.head.appendChild(link)
  }
  link.setAttribute('href', canonicalUrl)
}

function normalizePath(pathname) {
  const txt = String(pathname || '/').trim()
  if (!txt) return '/'
  if (txt.startsWith('/')) return txt
  return `/${txt}`
}

function titleFromPath(pathname, siteName) {
  const p = normalizePath(pathname)
  if (p === '/') return `หน้าแรก • ${siteName}`
  if (p.startsWith('/category/')) return `หมวดหมู่สินค้า • ${siteName}`
  if (p.startsWith('/product/')) return `รายละเอียดสินค้า • ${siteName}`
  if (p.startsWith('/topup')) return `เติมเงิน • ${siteName}`
  if (p === '/tos') return `เงื่อนไขการใช้งาน • ${siteName}`
  if (p === '/support') return `ช่วยเหลือ • ${siteName}`
  return `${siteName}`
}

function descriptionFromPath(pathname) {
  const p = normalizePath(pathname)
  if (p.startsWith('/category/')) return 'เลือกซื้อสินค้าเกมและดิจิทัลจากหมวดหมู่ยอดนิยม พร้อมโปรโมชันอัปเดตตลอด'
  if (p.startsWith('/product/')) return 'ดูรายละเอียดสินค้า ราคา และข้อมูลก่อนสั่งซื้อ พร้อมระบบส่งมอบรวดเร็ว'
  if (p.startsWith('/topup')) return 'เติมพ้อยท์รวดเร็ว ปลอดภัย ตรวจสอบสถานะได้ทันทีในระบบ'
  if (p === '/tos') return 'อ่านเงื่อนไขการใช้งานและนโยบายที่เกี่ยวข้องก่อนใช้งานเว็บไซต์'
  if (p === '/support') return 'ติดต่อทีมงานและดูช่องทางช่วยเหลือสำหรับการสั่งซื้อและการใช้งาน'
  return 'VxperS Store ร้านค้าไอเท็มเกมและสินค้าดิจิทัล เติมพ้อยท์รวดเร็ว ปลอดภัย พร้อมโปรโมชันอัปเดตตลอด'
}

function robotsFromPath(pathname) {
  const p = normalizePath(pathname)
  if (
    p.startsWith('/admin') ||
    p.startsWith('/profile') ||
    p.startsWith('/history') ||
    p === '/login' ||
    p === '/register' ||
    p.startsWith('/inbox')
  ) {
    return 'noindex, nofollow'
  }
  return 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'
}

export function applyRouteSeo(pathname, siteName, siteSettings) {
  if (typeof document === 'undefined') return

  const ss = siteSettings && typeof siteSettings === 'object' ? siteSettings : {}
  const siteUrl = String(ss.site_url || '').trim() || DEFAULT_SITE_URL
  const customDesc = String(ss.site_description || '').trim()
  const customOg = String(ss.og_image_url || '').trim()
  const finalSiteName = String(siteName || 'VxperS Store').trim() || 'VxperS Store'
  const path = normalizePath(pathname)
  const canonicalUrl = `${siteUrl}${path}`
  const title = titleFromPath(path, finalSiteName)
  const defaultDesc = descriptionFromPath(path)
  const description = (path === '/' && customDesc) ? customDesc : defaultDesc
  const robots = robotsFromPath(path)
  const imageUrl = customOg || `${siteUrl}/og-cover.jpg`
  const imageAlt = `${finalSiteName} cover image`

  document.title = title
  setCanonical(canonicalUrl)
  setMetaByName('description', description)
  setMetaByName('robots', robots)
  setMetaByName('googlebot', robots)

  setMetaByProperty('og:type', 'website')
  setMetaByProperty('og:site_name', finalSiteName)
  setMetaByProperty('og:locale', 'th_TH')
  setMetaByProperty('og:title', title)
  setMetaByProperty('og:description', description)
  setMetaByProperty('og:url', canonicalUrl)
  setMetaByProperty('og:image', imageUrl)
  setMetaByProperty('og:image:alt', imageAlt)

  setMetaByName('twitter:card', 'summary_large_image')
  setMetaByName('twitter:title', title)
  setMetaByName('twitter:description', description)
  setMetaByName('twitter:image', imageUrl)
  setMetaByName('twitter:image:alt', imageAlt)
}
