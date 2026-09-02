import { useState, useRef, useMemo, useCallback } from 'react'
import ImageUploadCropper, { CropModal, BatchCropModal } from '../../../components/admin/ImageUploadCropper.jsx'
import {
  formatNumber, getErrorMessage, pickNumber, makeSlug,
  DEFAULT_CATEGORY_FORM, DEFAULT_PRODUCT_FORM, DEFAULT_PRODUCT_OPTION_DRAFT,
  DEFAULT_CATALOG_FILTER, PRESET_BADGE_OPTIONS, normalizeCatalogFulfillmentType,
  normalizeProductCustomFormFields, normalizeCustomFormFieldsForSubmit,
  normalizeProductOptionsForSubmit, normalizeProductOptionId,
  normalizeVolumePricingForSubmit, normalizeGalleryImagesForSubmit,
  normalizeTagsForSubmit, createCustomFormFieldDraft,
} from '../helpers.js'

const PRESET_EMOJI_ICONS = ['🎮', '⚡', '🔑', '📦', '👑', '💎', '🛒', '🌟', '🛡️', '🔥', '🎁', '📱', '💻', '🚀', '🎯', '🏆']

const PRESET_TAGS = ['Steam', 'Valorant', 'Roblox', 'Netflix', 'Spotify', 'Discord', 'Auto Delivery', 'Key แท้']

export default function CatalogModule({ data, ctx }) {
  const { canAction, loadModuleData, fetchJson } = ctx
  const [view, setView] = useState('products')
  const [filter, setFilter] = useState(DEFAULT_CATALOG_FILTER)
  const [actionState, setActionState] = useState({ status: 'idle', message: '' })
  const [categoryForm, setCategoryForm] = useState(DEFAULT_CATEGORY_FORM)
  const [productForm, setProductForm] = useState(DEFAULT_PRODUCT_FORM)
  const [optionDraft, setOptionDraft] = useState(DEFAULT_PRODUCT_OPTION_DRAFT)
  const [optionError, setOptionError] = useState('')
  const [errors, setErrors] = useState({ category: '', product: '' })

  // Enhanced state for Selection & Bulk actions
  const [selectedIds, setSelectedIds] = useState([])
  const [bulkMode, setBulkMode] = useState('')
  const [bulkPayload, setBulkPayload] = useState({ category_id: '', mode: 'percent', value: '' })
  const [tagInput, setTagInput] = useState('')
  const [newGalleryUrl, setNewGalleryUrl] = useState('')
  const [uploadingGallery, setUploadingGallery] = useState(false)
  const [galleryUploadError, setGalleryUploadError] = useState('')
  const galleryFileInputRef = useRef(null)
  const galleryDirectUploadRef = useRef(null)
  const gallerySingleCropInputRef = useRef(null)
  const [galleryCropSrc, setGalleryCropSrc] = useState(null)
  const [galleryCropIndex, setGalleryCropIndex] = useState(null)
  const [loadingGalleryCrop, setLoadingGalleryCrop] = useState(false)
  const [batchCropItems, setBatchCropItems] = useState([])
  const [volumeTierDraft, setVolumeTierDraft] = useState({ min_qty: '', discount_percent: '', discount_amount_points: '' })
  const [volumeTierError, setVolumeTierError] = useState('')
  const [categorySearch, setCategorySearch] = useState('')
  const [categoryLayout, setCategoryLayout] = useState('tree') // 'tree' | 'table' | 'grid'
  const [categoryStatusFilter, setCategoryStatusFilter] = useState('all') // 'all' | 'visible' | 'hidden'
  const [expandedCategories, setExpandedCategories] = useState(new Set())
  const [deleteCategoryModal, setDeleteCategoryModal] = useState(null)
  const [quickSubModal, setQuickSubModal] = useState(null)

  if (!data) return null

  const canManage = canAction('catalog.manage')
  const categories = data.categories || []
  const products = data.products || []

  // Helper to get all descendant category IDs for recursive filtering
  const getCategoryDescendantIds = useCallback((catId) => {
    const targetId = Number(catId)
    if (!Number.isFinite(targetId) || targetId <= 0) return []
    const result = [targetId]
    const queue = [targetId]
    while (queue.length > 0) {
      const currentId = queue.shift()
      for (const c of categories) {
        if (Number(c.parent_id) === currentId && !result.includes(Number(c.id))) {
          result.push(Number(c.id))
          queue.push(Number(c.id))
        }
      }
    }
    return result
  }, [categories])

  // Hierarchical category tree
  const categoryTree = useMemo(() => {
    const sorted = [...categories].sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || a.id - b.id)
    const map = new Map()
    const roots = []

    for (const cat of sorted) {
      map.set(Number(cat.id), { ...cat, children: [] })
    }

    for (const cat of sorted) {
      const node = map.get(Number(cat.id))
      const pId = cat.parent_id ? Number(cat.parent_id) : null
      if (pId && map.has(pId)) {
        map.get(pId).children.push(node)
      } else {
        roots.push(node)
      }
    }
    return roots
  }, [categories])

  // Flattened hierarchical category options with indentation for dropdowns
  const categorySelectOptions = useMemo(() => {
    const result = []
    const currentExcludeId = categoryForm.id ? Number(categoryForm.id) : null
    const excludeIds = new Set()

    if (currentExcludeId) {
      const findDescendants = (nodeId) => {
        excludeIds.add(Number(nodeId))
        for (const root of categoryTree) {
          const check = (n) => {
            if (Number(n.id) === Number(nodeId)) {
              const addAll = (childNode) => {
                excludeIds.add(Number(childNode.id))
                if (childNode.children) childNode.children.forEach(addAll)
              }
              if (n.children) n.children.forEach(addAll)
            } else if (n.children) {
              n.children.forEach(check)
            }
          }
          check(root)
        }
      }
      findDescendants(currentExcludeId)
    }

    const traverse = (node, depth = 0) => {
      result.push({
        ...node,
        depth,
        isDisabled: excludeIds.has(Number(node.id)),
      })
      if (Array.isArray(node.children)) {
        for (const child of node.children) {
          traverse(child, depth + 1)
        }
      }
    }

    for (const root of categoryTree) {
      traverse(root, 0)
    }
    return result
  }, [categoryTree, categoryForm.id])

  const filteredProducts = products.filter(p => {
    if (filter.search && filter.search.trim()) {
      const q = filter.search.trim().toLowerCase()
      const catName = categories.find(c => String(c.id) === String(p.category_id))?.name || ''
      const matchName = String(p.name || '').toLowerCase().includes(q)
      const matchSlug = String(p.slug || '').toLowerCase().includes(q)
      const matchSku = String(p.sku || '').toLowerCase().includes(q)
      const matchCategory = String(catName).toLowerCase().includes(q)
      const matchDesc = String(p.description || '').toLowerCase().includes(q)
      const matchHighlights = String(p.highlights || '').toLowerCase().includes(q)
      const matchBadge = String(p.badge || '').toLowerCase().includes(q)
      const matchTags = Array.isArray(p.tags) && p.tags.some(t => String(t).toLowerCase().includes(q))
      if (!matchName && !matchSlug && !matchSku && !matchCategory && !matchDesc && !matchHighlights && !matchBadge && !matchTags) return false
    }
    if (filter.categoryId !== 'all') {
      const allowedIds = getCategoryDescendantIds(filter.categoryId)
      if (!allowedIds.includes(Number(p.category_id))) return false
    }
    if (filter.hidden === 'hidden' && !p.is_hidden) return false
    if (filter.hidden === 'visible' && p.is_hidden) return false
    if (filter.featured === 'featured' && !p.is_featured) return false
    if (filter.featured === 'not_featured' && p.is_featured) return false
    if (filter.badge && filter.badge !== 'all' && String(p.badge || '') !== filter.badge) return false
    if (filter.stock === 'in_stock' && !p.is_unlimited_stock && Number(p.available_stock ?? p.stock) <= 0) return false
    if (filter.stock === 'out_of_stock' && (p.is_unlimited_stock || Number(p.available_stock ?? p.stock) > 0)) return false
    if (filter.stock === 'unlimited' && !p.is_unlimited_stock) return false
    return true
  })

  const categoryStats = useMemo(() => {
    const total = categories.length
    const rootCount = categories.filter(c => !c.parent_id || Number(c.parent_id) === 0).length
    const subCount = categories.filter(c => Boolean(c.parent_id) && Number(c.parent_id) > 0).length
    let visible = 0
    let hidden = 0
    for (const c of categories) {
      if (c.is_hidden) hidden += 1
      else visible += 1
    }
    const totalProducts = products.length
    return { total, rootCount, subCount, visible, hidden, totalProducts }
  }, [categories, products])

  const filteredCategories = useMemo(() => {
    return categories.filter((c) => {
      const q = categorySearch.toLowerCase().trim()
      const matchSearch = !q || c.name?.toLowerCase().includes(q) || c.slug?.toLowerCase().includes(q) || String(c.id) === q
      let matchStatus = true
      if (categoryStatusFilter === 'visible') matchStatus = !c.is_hidden
      else if (categoryStatusFilter === 'hidden') matchStatus = Boolean(c.is_hidden)
      return matchSearch && matchStatus
    })
  }, [categories, categorySearch, categoryStatusFilter])

  function toggleExpandCategory(catId) {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      if (next.has(catId)) next.delete(catId)
      else next.add(catId)
      return next
    })
  }

  function toggleExpandAll() {
    if (expandedCategories.size >= categoryTree.length) {
      setExpandedCategories(new Set())
    } else {
      setExpandedCategories(new Set(categoryTree.map(c => Number(c.id))))
    }
  }

  function toggleSelectAll() {
    if (selectedIds.length === filteredProducts.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(filteredProducts.map(p => p.id))
    }
  }

  function toggleSelectProduct(id) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function editProduct(p) {
    setView('product-form')
    setProductForm({
      id: p.id, category_id: p.category_id == null ? '' : String(p.category_id),
      name: p.name || '', slug: p.slug || '', price: pickNumber(p.price), stock: pickNumber(p.stock),
      sort_order: pickNumber(p.sort_order), image_url: p.image_url || '', description: p.description || '',
      highlights: p.highlights || '', manual_url: p.manual_url || '', manual_text: p.manual_text || '',
      manual_video_url: p.manual_video_url || '', fulfillment_type: normalizeCatalogFulfillmentType(p.fulfillment_type),
      custom_form_fields: normalizeProductCustomFormFields(p),
      product_options: Array.isArray(p.product_options) ? p.product_options : [],
      is_featured: Boolean(p.is_featured), is_unlimited_stock: Boolean(p.is_unlimited_stock),
      gallery_images: Array.isArray(p.gallery_images) ? p.gallery_images : [],
      badge: p.badge || '',
      tags: Array.isArray(p.tags) ? p.tags : [],
      sku: p.sku || '',
      admin_notes: p.admin_notes || '',
      volume_pricing: Array.isArray(p.volume_pricing) ? p.volume_pricing : [],
      min_order_qty: Number(p.min_order_qty) || 1,
      max_order_qty: p.max_order_qty ? Number(p.max_order_qty) : '',
    })
    setErrors(prev => ({ ...prev, product: '' }))
    setGalleryUploadError('')
  }

  function addTags(raw) {
    if (!raw) return
    const splitTags = String(raw).split(/[,|\n]+/).map(s => s.trim()).filter(Boolean)
    if (splitTags.length === 0) return
    setProductForm(prev => {
      const current = Array.isArray(prev.tags) ? prev.tags : []
      const toAdd = splitTags.filter(t => !current.includes(t))
      return { ...prev, tags: [...current, ...toAdd] }
    })
    setTagInput('')
  }

  function removeTag(index) {
    setProductForm(prev => ({
      ...prev,
      tags: (Array.isArray(prev.tags) ? prev.tags : []).filter((_, i) => i !== index),
    }))
  }

  async function handleBatchFilesSelect(files) {
    if (!files || files.length === 0) return
    const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'))
    if (imageFiles.length === 0) return

    setUploadingGallery(true)
    setGalleryUploadError('')
    try {
      const loadedItems = []
      for (const file of imageFiles) {
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result)
          reader.onerror = reject
          reader.readAsDataURL(file)
        })
        loadedItems.push({ src: dataUrl, name: file.name })
      }
      setBatchCropItems(loadedItems)
    } catch (err) {
      setGalleryUploadError('เกิดข้อผิดพลาดในการอ่านไฟล์ภาพ')
    } finally {
      setUploadingGallery(false)
      if (galleryFileInputRef.current) galleryFileInputRef.current.value = ''
      if (gallerySingleCropInputRef.current) gallerySingleCropInputRef.current.value = ''
    }
  }

  function handleBatchCropComplete(uploadedUrls) {
    if (Array.isArray(uploadedUrls) && uploadedUrls.length > 0) {
      setProductForm(prev => ({
        ...prev,
        gallery_images: [...(Array.isArray(prev.gallery_images) ? prev.gallery_images : []), ...uploadedUrls],
      }))
    }
    setBatchCropItems([])
  }

  async function handleGalleryFilesUpload(files) {
    if (!files || files.length === 0) return
    setUploadingGallery(true)
    setGalleryUploadError('')
    try {
      const uploadedUrls = []
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) continue
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result)
          reader.onerror = reject
          reader.readAsDataURL(file)
        })
        const res = await fetchJson('/api/admin/media/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image_data: dataUrl }),
        })
        if (res.ok && res.url) {
          uploadedUrls.push(res.url)
        } else {
          throw new Error(res.error || 'อัปโหลดภาพไม่สำเร็จ')
        }
      }
      if (uploadedUrls.length > 0) {
        setProductForm(prev => ({
          ...prev,
          gallery_images: [...(Array.isArray(prev.gallery_images) ? prev.gallery_images : []), ...uploadedUrls],
        }))
      }
    } catch (err) {
      setGalleryUploadError(getErrorMessage(err, 'อัปโหลดรูปภาพไม่สำเร็จ'))
    } finally {
      setUploadingGallery(false)
      if (galleryDirectUploadRef.current) galleryDirectUploadRef.current.value = ''
    }
  }

  function addGalleryUrl() {
    const url = newGalleryUrl.trim()
    if (!url) return
    setProductForm(prev => ({
      ...prev,
      gallery_images: [...(Array.isArray(prev.gallery_images) ? prev.gallery_images : []), url],
    }))
    setNewGalleryUrl('')
  }

  function removeGalleryImage(index) {
    setProductForm(prev => ({
      ...prev,
      gallery_images: (Array.isArray(prev.gallery_images) ? prev.gallery_images : []).filter((_, i) => i !== index),
    }))
  }

  async function handleCropGalleryImage(imgUrl, index) {
    if (!imgUrl) return
    if (imgUrl.startsWith('data:image/')) {
      setGalleryCropSrc(imgUrl)
      setGalleryCropIndex(index)
      return
    }
    setLoadingGalleryCrop(true)
    try {
      const res = await fetchJson('/api/admin/media/fetch-remote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: imgUrl }),
      })
      if (res.ok && res.data_url) {
        setGalleryCropSrc(res.data_url)
      } else {
        setGalleryCropSrc(imgUrl)
      }
    } catch {
      setGalleryCropSrc(imgUrl)
    } finally {
      setLoadingGalleryCrop(false)
      setGalleryCropIndex(index)
    }
  }

  function handleSelectFileForCrop(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      alert('กรุณาเลือกไฟล์รูปภาพที่ถูกต้อง (JPG, PNG, WebP)')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setGalleryCropSrc(reader.result)
      setGalleryCropIndex('new')
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  function handleGalleryCropComplete(croppedUrl) {
    if (galleryCropIndex === 'new') {
      setProductForm(prev => ({
        ...prev,
        gallery_images: [...(Array.isArray(prev.gallery_images) ? prev.gallery_images : []), croppedUrl],
      }))
    } else if (typeof galleryCropIndex === 'number') {
      setProductForm(prev => {
        const list = Array.isArray(prev.gallery_images) ? [...prev.gallery_images] : []
        list[galleryCropIndex] = croppedUrl
        return { ...prev, gallery_images: list }
      })
    }
    setGalleryCropSrc(null)
    setGalleryCropIndex(null)
  }

  function editCategory(c) {
    setView('category-form')
    setCategoryForm({
      id: c.id,
      name: c.name || '',
      slug: c.slug || '',
      image_url: c.image_url || '',
      description: c.description || '',
      is_hidden: Boolean(c.is_hidden),
      parent_id: c.parent_id ? String(c.parent_id) : '',
      sort_order: Number(c.sort_order) || 0,
      icon: c.icon || '',
    })
    setErrors(prev => ({ ...prev, category: '' }))
  }

  function openAddSubcategory(parentCat = null) {
    if (parentCat) {
      setQuickSubModal({
        parentId: String(parentCat.id),
        parentName: parentCat.name,
        parentIcon: parentCat.icon || '📁',
        name: '',
        slug: '',
        icon: '⚡',
        description: '',
        image_url: '',
        is_hidden: false,
      })
    } else {
      const defaultParent = categories.find(c => !c.parent_id) || categories[0]
      setQuickSubModal({
        parentId: defaultParent ? String(defaultParent.id) : '',
        parentName: defaultParent ? defaultParent.name : '',
        parentIcon: defaultParent ? (defaultParent.icon || '📁') : '📁',
        name: '',
        slug: '',
        icon: '⚡',
        description: '',
        image_url: '',
        is_hidden: false,
      })
    }
  }

  async function saveQuickSubcategory() {
    if (!quickSubModal) return
    const { parentId, name, slug, icon, description, image_url, is_hidden } = quickSubModal
    if (!name.trim()) {
      alert('กรุณากรอกชื่อหมวดหมู่ย่อย')
      return
    }
    if (!parentId) {
      alert('กรุณาเลือกหมวดหมู่หลักที่เป็นต้นสังกัด')
      return
    }
    const finalSlug = slug.trim() || makeSlug(name.trim())
    const siblings = categories.filter(c => Number(c.parent_id) === Number(parentId))
    const body = {
      name: name.trim(),
      slug: finalSlug,
      icon: icon ? icon.trim() : '⚡',
      description: description.trim(),
      image_url: image_url.trim(),
      parent_id: Number(parentId),
      sort_order: (siblings.length + 1) * 10,
    }
    try {
      setActionState({ status: 'working', message: 'กำลังสร้างหมวดหมู่ย่อย...' })
      const created = await fetchJson('/api/admin/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (created?.id && is_hidden) {
        await fetchJson(`/api/admin/categories/${created.id}/hidden`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_hidden: true }),
        })
      }
      setActionState({ status: 'success', message: `สร้างหมวดหมู่ย่อย "${name}" เรียบร้อยแล้ว` })
      setQuickSubModal(null)
      setExpandedCategories(prev => new Set([...prev, Number(parentId)]))
      await loadModuleData('catalog')
    } catch (err) {
      setActionState({ status: 'error', message: getErrorMessage(err) })
    }
  }

  async function saveCategory() {
    const { id, name, slug, image_url, description, is_hidden, parent_id, sort_order, icon } = categoryForm
    if (!name.trim()) { setErrors(prev => ({ ...prev, category: 'ชื่อหมวดหมู่ห้ามว่าง' })); return }
    try {
      setActionState({ status: 'working', message: 'กำลังบันทึกหมวดหมู่...' })
      const body = {
        name: name.trim(),
        slug: slug.trim() || makeSlug(name),
        image_url: image_url.trim(),
        description: description.trim(),
        parent_id: parent_id ? Number(parent_id) : null,
        sort_order: Number(sort_order) || 0,
        icon: icon ? icon.trim() : null,
      }
      if (id) {
        await fetchJson(`/api/admin/categories/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        const original = categories.find(c => String(c.id) === String(id))
        if (original && Boolean(original.is_hidden) !== Boolean(is_hidden)) {
          await fetchJson(`/api/admin/categories/${id}/hidden`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_hidden: Boolean(is_hidden) }),
          })
        }
      } else {
        const created = await fetchJson('/api/admin/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        const cid = created?.id
        if (cid && is_hidden) {
          await fetchJson(`/api/admin/categories/${cid}/hidden`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_hidden: true }),
          })
        }
      }
      setActionState({ status: 'success', message: 'บันทึกหมวดหมู่เรียบร้อย' })
      setView('categories')
      await loadModuleData('catalog')
    } catch (err) {
      if (String(err?.message || '').includes('invalid_parent_circular')) {
        setErrors(prev => ({ ...prev, category: 'ไม่สามารถเลือกหมวดหมู่ย่อยของตัวเองเป็นหมวดหมู่หลักได้' }))
      } else if (String(err?.message || '').includes('invalid_parent_self')) {
        setErrors(prev => ({ ...prev, category: 'ไม่สามารถเลือกตัวเองเป็นหมวดหมู่หลักได้' }))
      } else {
        setActionState({ status: 'error', message: getErrorMessage(err) })
      }
    }
  }

  async function moveCategoryOrder(category, direction) {
    const pId = category.parent_id ? Number(category.parent_id) : null
    const siblings = categories
      .filter(c => (c.parent_id ? Number(c.parent_id) : null) === pId)
      .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || a.id - b.id)
    const currentIndex = siblings.findIndex(c => Number(c.id) === Number(category.id))
    if (currentIndex < 0) return
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
    if (targetIndex < 0 || targetIndex >= siblings.length) return

    const targetCategory = siblings[targetIndex]
    const updatedItems = [
      { id: category.id, sort_order: targetIndex * 10, parent_id: category.parent_id || null },
      { id: targetCategory.id, sort_order: currentIndex * 10, parent_id: targetCategory.parent_id || null },
    ]

    try {
      setActionState({ status: 'working', message: 'กำลังปรับลำดับ...' })
      await fetchJson('/api/admin/categories/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: updatedItems }),
      })
      setActionState({ status: 'success', message: 'ปรับลำดับหมวดหมู่เรียบร้อย' })
      await loadModuleData('catalog')
    } catch (err) {
      setActionState({ status: 'error', message: getErrorMessage(err) })
    }
  }

  function promptDeleteCategory(cat) {
    const directProducts = products.filter(p => String(p.category_id) === String(cat.id))
    const childCats = categories.filter(c => Number(c.parent_id) === Number(cat.id))
    if (directProducts.length > 0 || childCats.length > 0) {
      setDeleteCategoryModal({
        category: cat,
        directProductsCount: directProducts.length,
        childCatsCount: childCats.length,
        reassignTargetId: '',
      })
    } else {
      if (!window.confirm(`ยืนยันลบหมวดหมู่ "${cat.name}"?`)) return
      confirmDeleteCategory(cat.id, null)
    }
  }

  async function confirmDeleteCategory(categoryId, reassignTargetId = null) {
    try {
      setActionState({ status: 'working', message: 'กำลังลบหมวดหมู่...' })
      const queryParam = reassignTargetId ? `?reassign_to_category_id=${encodeURIComponent(reassignTargetId)}` : ''
      await fetchJson(`/api/admin/categories/${categoryId}${queryParam}`, { method: 'DELETE' })
      setActionState({ status: 'success', message: 'ลบหมวดหมู่เรียบร้อย' })
      setDeleteCategoryModal(null)
      await loadModuleData('catalog')
    } catch (err) {
      setActionState({ status: 'error', message: getErrorMessage(err) })
    }
  }

  async function toggleCategoryHidden(c) {
    if (!canManage) return
    const nextHidden = !c.is_hidden
    try {
      setActionState({ status: 'working', message: nextHidden ? 'กำลังซ่อนหมวดหมู่...' : 'กำลังเปิดแสดงหมวดหมู่...' })
      await fetchJson(`/api/admin/categories/${c.id}/hidden`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_hidden: nextHidden }),
      })
      setActionState({ status: 'success', message: nextHidden ? 'ซ่อนหมวดหมู่เรียบร้อย' : 'เปิดแสดงหมวดหมู่เรียบร้อย' })
      await loadModuleData('catalog')
    } catch (err) {
      setActionState({ status: 'error', message: getErrorMessage(err, 'ไม่สามารถเปลี่ยนสถานะหมวดหมู่ได้') })
    }
  }

  async function deleteCategory(id) {
    const cat = categories.find(c => Number(c.id) === Number(id))
    if (cat) promptDeleteCategory(cat)
  }

  async function duplicateProductItem(id) {
    if (!window.confirm('ต้องการคัดลอกสินค้านี้เป็นสินค้าใหม่หรือไม่?')) return
    try {
      setActionState({ status: 'working', message: 'กำลังคัดลอกสินค้า...' })
      await fetchJson(`/api/admin/products/${id}/duplicate`, { method: 'POST' })
      setActionState({ status: 'success', message: 'คัดลอกสินค้าสำเร็จ (สร้างเป็นสินค้าที่ซ่อนอยู่)' })
      await loadModuleData('catalog')
    } catch (err) {
      setActionState({ status: 'error', message: getErrorMessage(err, 'ไม่สามารถคัดลอกสินค้าได้') })
    }
  }

  async function toggleHidden(product) {
    if (!canManage) return
    const nextHidden = !product.is_hidden
    try {
      setActionState({ status: 'working', message: nextHidden ? 'กำลังซ่อนสินค้า...' : 'กำลังเปิดแสดงสินค้า...' })
      await fetchJson(`/api/admin/products/${product.id}/hidden`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_hidden: nextHidden }),
      })
      setActionState({ status: 'success', message: nextHidden ? 'ซ่อนสินค้าเรียบร้อย' : 'เปิดแสดงสินค้าเรียบร้อย' })
      await loadModuleData('catalog')
    } catch (err) {
      setActionState({ status: 'error', message: getErrorMessage(err, 'ไม่สามารถเปลี่ยนสถานะการแสดงผลได้') })
    }
  }

  async function toggleFeatured(product) {
    if (!canManage) return
    const nextFeatured = !product.is_featured
    try {
      setActionState({ status: 'working', message: nextFeatured ? 'กำลังตั้งเป็นสินค้าแนะนำ...' : 'กำลังยกเลิกสินค้าแนะนำ...' })
      await fetchJson(`/api/admin/products/${product.id}/featured`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_featured: nextFeatured }),
      })
      setActionState({ status: 'success', message: nextFeatured ? 'ตั้งเป็นสินค้าแนะนำเรียบร้อย ⭐' : 'ยกเลิกสินค้าแนะนำเรียบร้อย' })
      await loadModuleData('catalog')
    } catch (err) {
      setActionState({ status: 'error', message: getErrorMessage(err, 'ไม่สามารถเปลี่ยนสถานะสินค้าแนะนำได้') })
    }
  }

  async function executeBulk(action) {
    if (selectedIds.length === 0) return
    let payload = {}

    if (action === 'set_hidden_true') {
      if (!window.confirm(`ต้องการซ่อนสินค้าที่เลือกจำนวน ${selectedIds.length} รายการ?`)) return
      action = 'set_hidden'
      payload = { is_hidden: true }
    } else if (action === 'set_hidden_false') {
      if (!window.confirm(`ต้องการแสดงสินค้าที่เลือกจำนวน ${selectedIds.length} รายการ?`)) return
      action = 'set_hidden'
      payload = { is_hidden: false }
    } else if (action === 'set_featured_true') {
      if (!window.confirm(`ต้องการตั้งสินค้าที่เลือก ${selectedIds.length} รายการเป็นสินค้าแนะนำ (Featured)?`)) return
      action = 'set_featured'
      payload = { is_featured: true }
    } else if (action === 'set_featured_false') {
      if (!window.confirm(`ต้องการยกเลิกสินค้าแนะนำสำหรับ ${selectedIds.length} รายการที่เลือก?`)) return
      action = 'set_featured'
      payload = { is_featured: false }
    } else if (action === 'delete') {
      if (!window.confirm(`⚠️ ยืนยันการลบสินค้า ${selectedIds.length} รายการอย่างถาวร?`)) return
    } else if (action === 'set_category') {
      if (!bulkPayload.category_id) { alert('กรุณาเลือกหมวดหมู่ปลายทาง'); return }
      payload = { category_id: Number(bulkPayload.category_id) }
    } else if (action === 'adjust_price') {
      const val = Number(bulkPayload.value)
      if (!Number.isFinite(val)) { alert('กรุณาระบุจำนวนราคาที่ต้องการปรับ'); return }
      payload = { mode: bulkPayload.mode, value: val }
    }

    try {
      setActionState({ status: 'working', message: 'กำลังดำเนินการจัดการสินค้าแบบกลุ่ม...' })
      await fetchJson('/api/admin/products/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_ids: selectedIds, action, payload }),
      })
      setActionState({ status: 'success', message: `จัดการสินค้า ${selectedIds.length} รายการเรียบร้อย` })
      setSelectedIds([])
      setBulkMode('')
      await loadModuleData('catalog')
    } catch (err) {
      setActionState({ status: 'error', message: getErrorMessage(err, 'เกิดข้อผิดพลาดในการจัดการสินค้าแบบกลุ่ม') })
    }
  }

  async function saveProduct() {
    const f = productForm
    const categoryId = Number(f.category_id)
    const price = Number(f.price)
    const stock = Number(f.stock)
    const sortOrder = Number(f.sort_order)
    const name = String(f.name || '').trim()
    const slug = String(f.slug || '').trim() || makeSlug(name)

    if (!Number.isFinite(categoryId) || categoryId <= 0) { setErrors(prev => ({ ...prev, product: 'จำเป็นต้องเลือกหมวดหมู่' })); return }
    if (!name || !slug) { setErrors(prev => ({ ...prev, product: 'จำเป็นต้องกรอกชื่อและ slug' })); return }
    if (!Number.isFinite(price) || price < 0) { setErrors(prev => ({ ...prev, product: 'ราคาต้องเป็นตัวเลขที่ถูกต้อง' })); return }

    let productOptionsPayload = []
    let customFormFieldsPayload = []
    try {
      productOptionsPayload = normalizeProductOptionsForSubmit(f.product_options)
    } catch (err) {
      const msg = String(err?.message || '')
      if (msg.includes('_missing_id')) setErrors(prev => ({ ...prev, product: 'ตัวเลือกทุกรายการต้องมี ID' }))
      else if (msg.includes('_missing_label')) setErrors(prev => ({ ...prev, product: 'ตัวเลือกทุกรายการต้องมีชื่อแสดงผล' }))
      else if (msg.includes('_duplicate_id')) setErrors(prev => ({ ...prev, product: 'ID ตัวเลือกต้องไม่ซ้ำกัน' }))
      else setErrors(prev => ({ ...prev, product: 'ข้อมูลตัวเลือกสินค้าไม่ถูกต้อง' }))
      return
    }
    try {
      customFormFieldsPayload = normalizeCustomFormFieldsForSubmit(f.custom_form_fields)
    } catch (err) {
      const msg = String(err?.message || '')
      if (msg.includes('_missing_label')) setErrors(prev => ({ ...prev, product: 'ฟอร์มกำหนดเองทุกช่องต้องมีข้อความแสดงผล' }))
      else if (msg.includes('_missing_id')) setErrors(prev => ({ ...prev, product: 'ฟอร์มกำหนดเองทุกช่องต้องมีคีย์ข้อมูล' }))
      else setErrors(prev => ({ ...prev, product: 'ข้อมูลฟอร์มกำหนดเองไม่ถูกต้อง' }))
      return
    }

    const selectedFulfillmentType = normalizeCatalogFulfillmentType(f.fulfillment_type)
    const isMysteryProduct = selectedFulfillmentType === 'mystery_box'
    const useCustomForm = !isMysteryProduct && customFormFieldsPayload.length > 0
    const finalFulfillmentType = isMysteryProduct ? 'mystery_box' : useCustomForm ? 'farm_form' : 'digital_stock'

    const body = {
      category_id: categoryId, name, slug, price, stock: Number.isFinite(stock) ? stock : 0,
      sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
      image_url: String(f.image_url || '').trim() || null,
      description: String(f.description || '').trim(),
      highlights: String(f.highlights || '').trim(),
      manual_url: String(f.manual_url || '').trim(),
      manual_text: String(f.manual_text || '').trim(),
      manual_video_url: String(f.manual_video_url || '').trim(),
      fulfillment_type: finalFulfillmentType,
      is_featured: Boolean(f.is_featured),
      is_unlimited_stock: Boolean(f.is_unlimited_stock),
      farm_form_username_enabled: true,
      farm_form_password_enabled: true,
      farm_form_auth_key_enabled: true,
      farm_form_fields: useCustomForm ? customFormFieldsPayload : [],
      product_options: productOptionsPayload,
      gallery_images: normalizeGalleryImagesForSubmit(f.gallery_images),
      badge: String(f.badge || '').trim() || null,
      tags: normalizeTagsForSubmit(f.tags),
      sku: String(f.sku || '').trim() || null,
      admin_notes: String(f.admin_notes || '').trim() || null,
      volume_pricing: normalizeVolumePricingForSubmit(f.volume_pricing),
      min_order_qty: Number(f.min_order_qty) > 0 ? Number(f.min_order_qty) : 1,
      max_order_qty: Number(f.max_order_qty) > 0 ? Number(f.max_order_qty) : null,
    }
    try {
      setActionState({ status: 'working', message: f.id ? 'กำลังอัปเดตสินค้า...' : 'กำลังสร้างสินค้า...' })
      setErrors(prev => ({ ...prev, product: '' }))
      if (f.id) {
        await fetchJson(`/api/admin/products/${f.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      } else {
        await fetchJson('/api/admin/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      }
      setActionState({ status: 'success', message: 'บันทึกสินค้าเรียบร้อย' })
      setView('products')
      await loadModuleData('catalog')
    } catch (err) {
      if (Number(err?.status) === 409 && String(err?.data?.error || '') === 'slug_taken') {
        setErrors(prev => ({ ...prev, product: 'slug สินค้านี้ถูกใช้งานแล้ว' }))
      } else {
        setErrors(prev => ({ ...prev, product: getErrorMessage(err, 'ไม่สามารถบันทึกสินค้าได้') }))
      }
      setActionState({ status: 'error', message: 'ดำเนินการสินค้าไม่สำเร็จ' })
    }
  }

  async function deleteProduct(id) {
    if (!window.confirm('ยืนยันลบสินค้า?')) return
    try {
      setActionState({ status: 'working', message: 'กำลังลบ...' })
      await fetchJson(`/api/admin/products/${id}`, { method: 'DELETE' })
      setActionState({ status: 'success', message: 'ลบสินค้าเรียบร้อย' })
      await loadModuleData('catalog')
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) }
  }

  async function toggleHidden(p) {
    try {
      await fetchJson(`/api/admin/products/${p.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_hidden: !p.is_hidden }) })
      await loadModuleData('catalog')
    } catch (err) { setActionState({ status: 'error', message: getErrorMessage(err) }) }
  }

  function addProductOption() {
    const id = normalizeProductOptionId(optionDraft.id)
    if (!id) { setOptionError('กรุณาระบุ ID ตัวเลือก'); return }
    if (!optionDraft.label.trim()) { setOptionError('กรุณาระบุชื่อแสดงผล'); return }
    if ((productForm.product_options || []).some(o => normalizeProductOptionId(o.id) === id)) {
      setOptionError('ID ตัวเลือกนี้ถูกใช้แล้ว')
      return
    }
    setProductForm(prev => ({
      ...prev,
      product_options: [...(prev.product_options || []), {
        id,
        label: optionDraft.label.trim(),
        value: optionDraft.value ? Number(optionDraft.value) : 0,
        price_points: optionDraft.price_points !== '' ? Number(optionDraft.price_points) : 0,
      }],
    }))
    setOptionDraft(DEFAULT_PRODUCT_OPTION_DRAFT)
    setOptionError('')
  }

  function removeProductOption(id) {
    setProductForm(prev => ({
      ...prev,
      product_options: (prev.product_options || []).filter(o => normalizeProductOptionId(o.id) !== normalizeProductOptionId(id)),
    }))
  }

  function addVolumeTier() {
    const minQty = Number(volumeTierDraft.min_qty)
    if (!Number.isFinite(minQty) || minQty <= 1) { setVolumeTierError('จำนวนขั้นต่ำต้องมากกว่า 1'); return }
    const pct = volumeTierDraft.discount_percent !== '' ? Number(volumeTierDraft.discount_percent) : null
    const amt = volumeTierDraft.discount_amount_points !== '' ? Number(volumeTierDraft.discount_amount_points) : null
    if (!pct && !amt) { setVolumeTierError('กรุณาระบุส่วนลด (% หรือ แต้ม)'); return }
    setProductForm(prev => ({
      ...prev,
      volume_pricing: [...(prev.volume_pricing || []), { min_qty: minQty, discount_percent: pct, discount_amount_points: amt }]
        .sort((a, b) => a.min_qty - b.min_qty),
    }))
    setVolumeTierDraft({ min_qty: '', discount_percent: '', discount_amount_points: '' })
    setVolumeTierError('')
  }

  function removeVolumeTier(index) {
    setProductForm(prev => ({
      ...prev,
      volume_pricing: (prev.volume_pricing || []).filter((_, i) => i !== index),
    }))
  }

  function addCustomFormField() {
    setProductForm(prev => ({
      ...prev,
      custom_form_fields: [...(prev.custom_form_fields || []), createCustomFormFieldDraft()],
    }))
  }

  function updateCustomFormField(index, patch) {
    setProductForm(prev => {
      const list = [...(prev.custom_form_fields || [])]
      list[index] = { ...list[index], ...patch }
      return { ...prev, custom_form_fields: list }
    })
  }

  function removeCustomFormField(index) {
    setProductForm(prev => ({
      ...prev,
      custom_form_fields: (prev.custom_form_fields || []).filter((_, i) => i !== index),
    }))
  }

  const selectedCategory = categories.find(c => String(c.id) === String(productForm.category_id))

  // ── Render ──
  return (
    <div>
      {actionState.status !== 'idle' && actionState.message && (
        <div className={`lgx-banner ${actionState.status === 'error' ? 'crit' : actionState.status === 'working' ? 'info' : 'ok'}`} style={{ marginBottom: 14 }}>
          <span>{actionState.message}</span>
          <button type="button" className="lgx-banner-close" onClick={() => setActionState({ status: 'idle', message: '' })}>×</button>
        </div>
      )}

      {(view === 'products' || view === 'categories') && (
        <div className="lgx-inline-tabs" style={{ marginBottom: 16 }}>
          <button type="button" className={`lgx-inline-tab ${view === 'products' ? 'is-active' : ''}`} onClick={() => setView('products')}>
            สินค้า ({products.length})
          </button>
          <button type="button" className={`lgx-inline-tab ${view === 'categories' ? 'is-active' : ''}`} onClick={() => setView('categories')}>
            หมวดหมู่ ({categories.length})
          </button>
        </div>
      )}

      {/* ══════════ PRODUCTS VIEW ══════════ */}
      {view === 'products' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="lgx-strip">
            <div className="lgx-stat"><div className="l">สินค้าทั้งหมด</div><div className="v">{products.length}</div></div>
            <div className="lgx-stat"><div className="l">แสดงผลอยู่</div><div className="v">{products.filter(p => !p.is_hidden).length}</div></div>
            <div className="lgx-stat"><div className="l">สินค้าแนะนำ</div><div className="v">{products.filter(p => p.is_featured).length}</div></div>
            <div className="lgx-stat"><div className="l">ผลการค้นหา</div><div className="v">{filteredProducts.length}</div></div>
            <button type="button" className="lgx-stat is-clickable" onClick={() => { setProductForm(DEFAULT_PRODUCT_FORM); setErrors(prev => ({ ...prev, product: '' })); setView('product-form') }}>
              <div className="l">&nbsp;</div><div className="v" style={{ color: 'var(--lgx-accent)', fontSize: 15 }}>+ เพิ่มสินค้าใหม่</div>
            </button>
          </div>

          <div className="lgx-panel">
            <div className="lgx-panel-body" style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              <input className="lgx-input" style={{ flex: '2 1 220px' }} placeholder="ค้นหาชื่อ / slug / SKU / แท็ก..." value={filter.search} onChange={(e) => setFilter(prev => ({ ...prev, search: e.target.value }))} />
              <select className="lgx-select" style={{ flex: '1 1 160px' }} value={filter.categoryId} onChange={(e) => setFilter(prev => ({ ...prev, categoryId: e.target.value }))}>
                <option value="all">ทุกหมวดหมู่</option>
                {categorySelectOptions.map(c => (
                  <option key={c.id} value={c.id}>{' '.repeat(c.depth * 3)}{c.depth > 0 ? '↳ ' : ''}{c.icon ? `${c.icon} ` : ''}{c.name}</option>
                ))}
              </select>
              <select className="lgx-select" style={{ flex: '1 1 130px' }} value={filter.featured} onChange={(e) => setFilter(prev => ({ ...prev, featured: e.target.value }))}>
                <option value="all">ทุกสถานะแนะนำ</option>
                <option value="featured">แนะนำ ⭐</option>
                <option value="not_featured">ไม่แนะนำ</option>
              </select>
              <select className="lgx-select" style={{ flex: '1 1 130px' }} value={filter.hidden} onChange={(e) => setFilter(prev => ({ ...prev, hidden: e.target.value }))}>
                <option value="all">ทุกการแสดงผล</option>
                <option value="visible">แสดงอยู่</option>
                <option value="hidden">ซ่อนอยู่</option>
              </select>
              <select className="lgx-select" style={{ flex: '1 1 130px' }} value={filter.stock} onChange={(e) => setFilter(prev => ({ ...prev, stock: e.target.value }))}>
                <option value="all">ทุกสถานะสต๊อก</option>
                <option value="in_stock">มีสต๊อก</option>
                <option value="out_of_stock">หมดสต๊อก</option>
                <option value="unlimited">ไม่จำกัด</option>
              </select>
              <select className="lgx-select" style={{ flex: '1 1 130px' }} value={filter.badge || 'all'} onChange={(e) => setFilter(prev => ({ ...prev, badge: e.target.value }))}>
                <option value="all">ทุกป้าย</option>
                {PRESET_BADGE_OPTIONS.filter(b => b.value).map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
              </select>
            </div>
          </div>

          {selectedIds.length > 0 && (
            <div className="lgx-panel" style={{ borderColor: 'var(--lgx-accent)' }}>
              <div className="lgx-panel-body" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
                <strong style={{ fontSize: 12.5 }}>เลือกอยู่ {selectedIds.length} รายการ</strong>
                <div className="lgx-btn-group">
                  <button type="button" className="lgx-btn" disabled={!canManage} onClick={() => executeBulk('set_featured_true')}>+ แนะนำ</button>
                  <button type="button" className="lgx-btn" disabled={!canManage} onClick={() => executeBulk('set_featured_false')}>- แนะนำ</button>
                  <button type="button" className="lgx-btn" disabled={!canManage} onClick={() => executeBulk('set_hidden_true')}>ซ่อน</button>
                  <button type="button" className="lgx-btn" disabled={!canManage} onClick={() => executeBulk('set_hidden_false')}>แสดง</button>
                  <button type="button" className={`lgx-btn ${bulkMode === 'category' ? 'lgx-btn-accent' : ''}`} disabled={!canManage} onClick={() => setBulkMode(bulkMode === 'category' ? '' : 'category')}>ย้ายหมวดหมู่</button>
                  <button type="button" className={`lgx-btn ${bulkMode === 'price' ? 'lgx-btn-accent' : ''}`} disabled={!canManage} onClick={() => setBulkMode(bulkMode === 'price' ? '' : 'price')}>ปรับราคา</button>
                  <button type="button" className="lgx-btn" style={{ color: 'var(--lgx-crit)' }} disabled={!canManage} onClick={() => executeBulk('delete')}>ลบ</button>
                </div>
                <button type="button" className="lgx-btn" style={{ marginLeft: 'auto' }} onClick={() => { setSelectedIds([]); setBulkMode('') }}>ยกเลิกการเลือก</button>
              </div>
              {bulkMode === 'category' && (
                <div className="lgx-panel-body" style={{ borderTop: '1px solid var(--lgx-border)', display: 'flex', gap: 8 }}>
                  <select className="lgx-select" style={{ flex: 1 }} value={bulkPayload.category_id} onChange={(e) => setBulkPayload(prev => ({ ...prev, category_id: e.target.value }))}>
                    <option value="">-- เลือกหมวดหมู่ปลายทาง --</option>
                    {categorySelectOptions.map(c => (
                      <option key={c.id} value={c.id}>{' '.repeat(c.depth * 3)}{c.name}</option>
                    ))}
                  </select>
                  <button type="button" className="lgx-btn lgx-btn-accent" onClick={() => executeBulk('set_category')}>ย้าย</button>
                </div>
              )}
              {bulkMode === 'price' && (
                <div className="lgx-panel-body" style={{ borderTop: '1px solid var(--lgx-border)', display: 'flex', gap: 8 }}>
                  <select className="lgx-select" style={{ flex: '0 0 160px' }} value={bulkPayload.mode} onChange={(e) => setBulkPayload(prev => ({ ...prev, mode: e.target.value }))}>
                    <option value="percent">ปรับเปอร์เซ็นต์ (%)</option>
                    <option value="fixed">ปรับจำนวนคงที่</option>
                  </select>
                  <input className="lgx-input" style={{ flex: 1 }} type="number" placeholder="ค่าที่ปรับ เช่น -10 หรือ 10" value={bulkPayload.value} onChange={(e) => setBulkPayload(prev => ({ ...prev, value: e.target.value }))} />
                  <button type="button" className="lgx-btn lgx-btn-accent" onClick={() => executeBulk('adjust_price')}>ปรับราคา</button>
                </div>
              )}
            </div>
          )}

          <div className="lgx-panel">
            <div style={{ overflowX: 'auto' }}>
              <table className="lgx-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ width: 32 }}><input type="checkbox" checked={selectedIds.length > 0 && selectedIds.length === filteredProducts.length} onChange={toggleSelectAll} /></th>
                    <th>สินค้า</th>
                    <th>หมวดหมู่</th>
                    <th className="num">ราคา</th>
                    <th>สต๊อก</th>
                    <th>ประเภท</th>
                    <th style={{ textAlign: 'right' }}>จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map(p => {
                    const cat = categories.find(c => String(c.id) === String(p.category_id))
                    const stockVal = Number(p.available_stock ?? p.stock)
                    return (
                      <tr key={p.id} className={p.is_hidden ? '' : (p.is_unlimited_stock || stockVal > 0 ? 'st-ok' : 'st-crit')}>
                        <td><input type="checkbox" checked={selectedIds.includes(p.id)} onChange={() => toggleSelectProduct(p.id)} /></td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            {p.image_url ? <img src={p.image_url} alt="" className="lgx-thumb" /> : <div className="lgx-thumb-empty" />}
                            <div>
                              <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
                                {p.is_featured && <span title="สินค้าแนะนำ">⭐</span>}
                                <span>{p.name}</span>
                                {p.badge && <span className="lgx-pill neutral">{p.badge}</span>}
                                {p.is_hidden && <span className="lgx-pill neutral">ซ่อน</span>}
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--lgx-text-muted)', fontFamily: 'var(--lgx-mono)' }}>/{p.slug}{p.sku ? ` • SKU:${p.sku}` : ''}</div>
                            </div>
                          </div>
                        </td>
                        <td>{cat ? `${cat.icon ? cat.icon + ' ' : ''}${cat.name}` : '—'}</td>
                        <td className="num">฿{formatNumber(p.price)}</td>
                        <td>{p.is_unlimited_stock ? <span className="lgx-pill ok">ไม่จำกัด</span> : stockVal > 0 ? <span className="lgx-pill ok">{stockVal}</span> : <span className="lgx-pill crit">หมด</span>}</td>
                        <td style={{ fontSize: 11.5 }}>{normalizeCatalogFulfillmentType(p.fulfillment_type)}</td>
                        <td>
                          <div className="lgx-btn-group" style={{ justifyContent: 'flex-end' }}>
                            <button type="button" className="lgx-icon-action" title="สินค้าแนะนำ" disabled={!canManage} onClick={() => toggleFeatured(p)}>{p.is_featured ? '★' : '☆'}</button>
                            <button type="button" className="lgx-icon-action" title="แก้ไข" onClick={() => editProduct(p)}>✎</button>
                            <button type="button" className="lgx-icon-action" title="คัดลอก" disabled={!canManage} onClick={() => duplicateProductItem(p.id)}>⧉</button>
                            <button type="button" className="lgx-icon-action" title={p.is_hidden ? 'แสดง' : 'ซ่อน'} disabled={!canManage} onClick={() => toggleHidden(p)}>{p.is_hidden ? '👁' : '🚫'}</button>
                            <button type="button" className="lgx-icon-action danger" title="ลบ" disabled={!canManage} onClick={() => deleteProduct(p.id)}>✕</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {filteredProducts.length === 0 && <div className="lgx-empty">ไม่พบสินค้าที่ตรงกับตัวกรอง</div>}
            </div>
          </div>
        </div>
      )}

      {/* ══════════ PRODUCT FORM VIEW ══════════ */}
      {view === 'product-form' && (
        <div>
          <div className="lgx-panel" style={{ marginBottom: 14, position: 'sticky', top: 8, zIndex: 5 }}>
            <div className="lgx-panel-body" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button type="button" className="lgx-btn" onClick={() => setView('products')}>← กลับ</button>
                <div>
                  <div style={{ fontWeight: 700 }}>{productForm.id ? `แก้ไขสินค้า: ${productForm.name || `#${productForm.id}`}` : 'เพิ่มสินค้าใหม่'}</div>
                  <div style={{ fontSize: 11, color: 'var(--lgx-text-muted)' }}>{productForm.id ? `รหัส #${productForm.id}` : 'กรอกข้อมูลเพื่อสร้างสินค้าใหม่'}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="lgx-btn" onClick={() => setView('products')}>ยกเลิก</button>
                <button type="button" className="lgx-btn lgx-btn-accent" disabled={!canManage || actionState.status === 'working'} onClick={saveProduct}>
                  {actionState.status === 'working' ? 'กำลังบันทึก...' : 'บันทึกสินค้า'}
                </button>
              </div>
            </div>
          </div>

          {errors.product && (
            <div className="lgx-banner crit" style={{ marginBottom: 14 }}>
              <span>{errors.product}</span>
              <button type="button" className="lgx-banner-close" onClick={() => setErrors(prev => ({ ...prev, product: '' }))}>×</button>
            </div>
          )}

          <div className="lgx-split">
            {/* LEFT COLUMN */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Card 1: Basic info */}
              <div className="lgx-panel">
                <div className="lgx-panel-head"><h2>ข้อมูลพื้นฐาน</h2></div>
                <div className="lgx-panel-body">
                  <div className="lgx-form-grid">
                    <div className="lgx-field">
                      <label>ชื่อสินค้า *</label>
                      <input className="lgx-input" value={productForm.name} onChange={(e) => {
                        const val = e.target.value
                        setProductForm(prev => ({ ...prev, name: val, slug: !prev.id && (!prev.slug || prev.slug === makeSlug(prev.name)) ? makeSlug(val) : prev.slug }))
                      }} />
                    </div>
                    <div className="lgx-field">
                      <label>Slug (URL) *</label>
                      <input className="lgx-input" style={{ fontFamily: 'var(--lgx-mono)' }} value={productForm.slug} onChange={(e) => setProductForm(prev => ({ ...prev, slug: e.target.value }))} />
                    </div>
                    <div className="lgx-field">
                      <label>หมวดหมู่ *</label>
                      <select className="lgx-select" value={productForm.category_id} onChange={(e) => setProductForm(prev => ({ ...prev, category_id: e.target.value }))}>
                        <option value="">-- เลือกหมวดหมู่ --</option>
                        {categorySelectOptions.map(c => (
                          <option key={c.id} value={c.id}>{' '.repeat(c.depth * 3)}{c.depth > 0 ? '↳ ' : ''}{c.icon ? `${c.icon} ` : ''}{c.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="lgx-field">
                      <label>SKU</label>
                      <input className="lgx-input" style={{ fontFamily: 'var(--lgx-mono)' }} value={productForm.sku} onChange={(e) => setProductForm(prev => ({ ...prev, sku: e.target.value }))} />
                    </div>
                    <div className="lgx-field">
                      <label>ลำดับการแสดงผล</label>
                      <input className="lgx-input" type="number" value={productForm.sort_order} onChange={(e) => setProductForm(prev => ({ ...prev, sort_order: Number(e.target.value) }))} />
                    </div>
                  </div>
                  <div className="lgx-field" style={{ marginTop: 12 }}>
                    <label>ป้ายกำกับ (Badge)</label>
                    <div className="lgx-chip-row">
                      {PRESET_BADGE_OPTIONS.filter(b => b.value).map(b => (
                        <button key={b.value} type="button" className={`lgx-chip ${productForm.badge === b.value ? 'is-active' : ''}`} onClick={() => setProductForm(prev => ({ ...prev, badge: prev.badge === b.value ? '' : b.value }))}>{b.label}</button>
                      ))}
                    </div>
                    <input className="lgx-input" style={{ marginTop: 8 }} placeholder="หรือพิมพ์ป้ายกำหนดเอง" value={productForm.badge} onChange={(e) => setProductForm(prev => ({ ...prev, badge: e.target.value }))} />
                  </div>
                </div>
              </div>

              {/* Card 2: Description */}
              <div className="lgx-panel">
                <div className="lgx-panel-head"><h2>คำอธิบายและจุดเด่น</h2></div>
                <div className="lgx-panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div className="lgx-field">
                    <label>คำอธิบายสินค้า</label>
                    <textarea className="lgx-textarea" rows={3} value={productForm.description} onChange={(e) => setProductForm(prev => ({ ...prev, description: e.target.value }))} />
                  </div>
                  <div className="lgx-field">
                    <label>จุดเด่น (Highlights)</label>
                    <textarea className="lgx-textarea" rows={2} value={productForm.highlights} onChange={(e) => setProductForm(prev => ({ ...prev, highlights: e.target.value }))} />
                  </div>
                </div>
              </div>

              {/* Card 3: Media / Gallery */}
              <div className="lgx-panel">
                <div className="lgx-panel-head"><h2>รูปภาพและแกลเลอรี</h2></div>
                <div className="lgx-panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <ImageUploadCropper
                    label="รูปปกสินค้า (Cover Image)"
                    value={productForm.image_url}
                    onChange={(url) => setProductForm(prev => ({ ...prev, image_url: url }))}
                    aspectRatio={1}
                    helpText="อัปโหลดรูปปกสินค้า หรือตัดแต่งสัดส่วน 1:1"
                  />
                  <div>
                    <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--lgx-text-muted)', display: 'block', marginBottom: 6 }}>แกลเลอรีรูปภาพเพิ่มเติม</label>
                    <div className="lgx-gallery-grid">
                      {(productForm.gallery_images || []).map((url, idx) => (
                        <div key={`${url}-${idx}`} className="lgx-gallery-item">
                          <img src={url} alt="" />
                          <div className="lgx-gallery-actions">
                            <button type="button" onClick={() => handleCropGalleryImage(url, idx)}>ครอป</button>
                            <button type="button" className="danger" onClick={() => removeGalleryImage(idx)}>ลบ</button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                      <button type="button" className="lgx-btn" disabled={uploadingGallery} onClick={() => galleryFileInputRef.current?.click()}>+ อัปโหลดหลายรูป (ครอปทีละรูป)</button>
                      <button type="button" className="lgx-btn" disabled={uploadingGallery} onClick={() => galleryDirectUploadRef.current?.click()}>+ อัปโหลดตรง (ไม่ครอป)</button>
                      <button type="button" className="lgx-btn" onClick={() => gallerySingleCropInputRef.current?.click()}>+ เพิ่มรูปแล้วครอป</button>
                      <input ref={galleryFileInputRef} type="file" accept="image/*" multiple hidden onChange={(e) => handleBatchFilesSelect(e.target.files)} />
                      <input ref={galleryDirectUploadRef} type="file" accept="image/*" multiple hidden onChange={(e) => handleGalleryFilesUpload(e.target.files)} />
                      <input ref={gallerySingleCropInputRef} type="file" accept="image/*" hidden onChange={handleSelectFileForCrop} />
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <input className="lgx-input" style={{ flex: 1 }} placeholder="หรือวาง URL รูปภาพ" value={newGalleryUrl} onChange={(e) => setNewGalleryUrl(e.target.value)} />
                      <button type="button" className="lgx-btn" onClick={addGalleryUrl}>เพิ่ม URL</button>
                    </div>
                    {galleryUploadError && <div className="lgx-banner crit" style={{ marginTop: 10 }}><span>{galleryUploadError}</span></div>}
                  </div>
                </div>
              </div>

              {/* Card 4: Product options */}
              <div className="lgx-panel">
                <div className="lgx-panel-head"><h2>ตัวเลือกสินค้า (Options)</h2></div>
                <div className="lgx-panel-body">
                  <div className="lgx-builder-list">
                    {(productForm.product_options || []).map(o => (
                      <div key={o.id} className="lgx-builder-row">
                        <div className="lgx-builder-main"><strong>{o.label}</strong> <span style={{ color: 'var(--lgx-text-muted)' }}>({o.id})</span></div>
                        <span>ค่า: {o.value}</span>
                        <span>ราคาเพิ่ม: ฿{formatNumber(o.price_points)}</span>
                        <button type="button" className="lgx-icon-action danger" onClick={() => removeProductOption(o.id)}>✕</button>
                      </div>
                    ))}
                  </div>
                  <div className="lgx-builder-add" style={{ marginTop: 10 }}>
                    <div className="lgx-field"><label>ID</label><input className="lgx-input" value={optionDraft.id} onChange={(e) => setOptionDraft(prev => ({ ...prev, id: e.target.value }))} /></div>
                    <div className="lgx-field"><label>ชื่อแสดงผล</label><input className="lgx-input" value={optionDraft.label} onChange={(e) => setOptionDraft(prev => ({ ...prev, label: e.target.value }))} /></div>
                    <div className="lgx-field"><label>ค่า</label><input className="lgx-input" type="number" value={optionDraft.value} onChange={(e) => setOptionDraft(prev => ({ ...prev, value: e.target.value }))} /></div>
                    <div className="lgx-field"><label>ราคาเพิ่ม (แต้ม)</label><input className="lgx-input" type="number" value={optionDraft.price_points} onChange={(e) => setOptionDraft(prev => ({ ...prev, price_points: e.target.value }))} /></div>
                    <button type="button" className="lgx-btn lgx-btn-accent" onClick={addProductOption}>+ เพิ่ม</button>
                  </div>
                  {optionError && <div className="lgx-banner crit" style={{ marginTop: 10 }}><span>{optionError}</span></div>}
                </div>
              </div>

              {/* Card 5: Volume pricing */}
              <div className="lgx-panel">
                <div className="lgx-panel-head"><h2>ราคาแบบขั้นบันได (Volume Pricing)</h2></div>
                <div className="lgx-panel-body">
                  <div className="lgx-builder-list">
                    {(productForm.volume_pricing || []).map((t, idx) => (
                      <div key={idx} className="lgx-builder-row">
                        <div className="lgx-builder-main">ซื้อตั้งแต่ {t.min_qty} ชิ้น</div>
                        <span>{t.discount_percent ? `ลด ${t.discount_percent}%` : t.discount_amount_points ? `ลด ${t.discount_amount_points} แต้ม/ชิ้น` : '—'}</span>
                        <button type="button" className="lgx-icon-action danger" onClick={() => removeVolumeTier(idx)}>✕</button>
                      </div>
                    ))}
                  </div>
                  <div className="lgx-builder-add" style={{ marginTop: 10 }}>
                    <div className="lgx-field"><label>ขั้นต่ำ (ชิ้น)</label><input className="lgx-input" type="number" value={volumeTierDraft.min_qty} onChange={(e) => setVolumeTierDraft(prev => ({ ...prev, min_qty: e.target.value }))} /></div>
                    <div className="lgx-field"><label>ลด %</label><input className="lgx-input" type="number" value={volumeTierDraft.discount_percent} onChange={(e) => setVolumeTierDraft(prev => ({ ...prev, discount_percent: e.target.value }))} /></div>
                    <div className="lgx-field"><label>หรือ ลดแต้ม/ชิ้น</label><input className="lgx-input" type="number" value={volumeTierDraft.discount_amount_points} onChange={(e) => setVolumeTierDraft(prev => ({ ...prev, discount_amount_points: e.target.value }))} /></div>
                    <button type="button" className="lgx-btn lgx-btn-accent" onClick={addVolumeTier}>+ เพิ่มระดับ</button>
                  </div>
                  {volumeTierError && <div className="lgx-banner crit" style={{ marginTop: 10 }}><span>{volumeTierError}</span></div>}
                </div>
              </div>

              {/* Card 6: Custom form fields */}
              <div className="lgx-panel">
                <div className="lgx-panel-head"><h2>ฟอร์มกำหนดเอง (Custom Form)</h2></div>
                <div className="lgx-panel-body">
                  <div className="lgx-builder-list">
                    {(productForm.custom_form_fields || []).map((f, idx) => (
                      <div key={f.id || idx} className="lgx-builder-row">
                        <input className="lgx-input lgx-builder-main" placeholder="ข้อความแสดงผล (Label)" value={f.label || ''} onChange={(e) => updateCustomFormField(idx, { label: e.target.value })} />
                        <select className="lgx-select" style={{ width: 130 }} value={f.type || 'text'} onChange={(e) => updateCustomFormField(idx, { type: e.target.value })}>
                          <option value="text">ข้อความ</option>
                          <option value="checkbox">Checkbox</option>
                        </select>
                        <label className="lgx-checkbox-row"><input type="checkbox" checked={Boolean(f.required)} onChange={(e) => updateCustomFormField(idx, { required: e.target.checked })} /> จำเป็น</label>
                        <button type="button" className="lgx-icon-action danger" onClick={() => removeCustomFormField(idx)}>✕</button>
                      </div>
                    ))}
                  </div>
                  <button type="button" className="lgx-btn" style={{ marginTop: 10 }} onClick={addCustomFormField}>+ เพิ่มช่องฟอร์ม</button>
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, position: 'sticky', top: 84 }}>
              {/* Card A: Live preview */}
              <div className="lgx-panel">
                <div className="lgx-panel-head"><h2>ตัวอย่างหน้าร้าน</h2></div>
                <div className="lgx-panel-body">
                  <div style={{ border: '1.5px solid var(--lgx-border)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ aspectRatio: '1', background: 'var(--lgx-surface-alt)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {productForm.image_url ? <img src={productForm.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ color: 'var(--lgx-text-muted)', fontSize: 12 }}>ไม่มีรูปปก</span>}
                    </div>
                    <div style={{ padding: 10 }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{productForm.name || 'ชื่อสินค้าตัวอย่าง'}</div>
                      <div style={{ fontSize: 11, color: 'var(--lgx-text-muted)' }}>{selectedCategory ? selectedCategory.name : 'ยังไม่เลือกหมวดหมู่'}</div>
                      <div style={{ fontFamily: 'var(--lgx-mono)', fontWeight: 700, marginTop: 6 }}>฿{formatNumber(productForm.price || 0)}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card B: Price & limits */}
              <div className="lgx-panel">
                <div className="lgx-panel-head"><h2>ราคาและขีดจำกัด</h2></div>
                <div className="lgx-panel-body">
                  <div className="lgx-form-grid">
                    <div className="lgx-field"><label>ราคา (฿) *</label><input className="lgx-input" type="number" value={productForm.price} onChange={(e) => setProductForm(prev => ({ ...prev, price: e.target.value }))} /></div>
                    <div className="lgx-field"><label>สต๊อก</label><input className="lgx-input" type="number" disabled={productForm.is_unlimited_stock} value={productForm.stock} onChange={(e) => setProductForm(prev => ({ ...prev, stock: e.target.value }))} /></div>
                    <div className="lgx-field"><label>ซื้อขั้นต่ำ</label><input className="lgx-input" type="number" value={productForm.min_order_qty} onChange={(e) => setProductForm(prev => ({ ...prev, min_order_qty: e.target.value }))} /></div>
                    <div className="lgx-field"><label>ซื้อสูงสุด</label><input className="lgx-input" type="number" value={productForm.max_order_qty} onChange={(e) => setProductForm(prev => ({ ...prev, max_order_qty: e.target.value }))} /></div>
                  </div>
                </div>
              </div>

              {/* Card C: Fulfillment */}
              <div className="lgx-panel">
                <div className="lgx-panel-head"><h2>รูปแบบการส่งมอบ</h2></div>
                <div className="lgx-panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div className="lgx-segmented">
                    <button type="button" className={`lgx-segmented-btn ${productForm.fulfillment_type !== 'mystery_box' ? 'is-active' : ''}`} onClick={() => setProductForm(prev => ({ ...prev, fulfillment_type: 'digital_stock' }))}>สต๊อกดิจิทัล</button>
                    <button type="button" className={`lgx-segmented-btn ${productForm.fulfillment_type === 'mystery_box' ? 'is-active' : ''}`} onClick={() => setProductForm(prev => ({ ...prev, fulfillment_type: 'mystery_box' }))}>กล่องสุ่ม</button>
                  </div>
                  <div className="lgx-field"><label>ลิงก์คู่มือ (Manual URL)</label><input className="lgx-input" value={productForm.manual_url} onChange={(e) => setProductForm(prev => ({ ...prev, manual_url: e.target.value }))} /></div>
                  <div className="lgx-field"><label>ลิงก์วิดีโอสอนใช้</label><input className="lgx-input" value={productForm.manual_video_url} onChange={(e) => setProductForm(prev => ({ ...prev, manual_video_url: e.target.value }))} /></div>
                  <div className="lgx-field"><label>ข้อความคู่มือ</label><textarea className="lgx-textarea" rows={2} value={productForm.manual_text} onChange={(e) => setProductForm(prev => ({ ...prev, manual_text: e.target.value }))} /></div>
                </div>
              </div>

              {/* Card D: Status */}
              <div className="lgx-panel">
                <div className="lgx-panel-head"><h2>สถานะและการแสดงผล</h2></div>
                <div className="lgx-panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label className="lgx-checkbox-row"><input type="checkbox" checked={productForm.is_featured} onChange={(e) => setProductForm(prev => ({ ...prev, is_featured: e.target.checked }))} /> สินค้าแนะนำ (Featured)</label>
                  <label className="lgx-checkbox-row"><input type="checkbox" checked={productForm.is_unlimited_stock} onChange={(e) => setProductForm(prev => ({ ...prev, is_unlimited_stock: e.target.checked }))} /> สต๊อกไม่จำกัด</label>
                </div>
              </div>

              {/* Card E: Tags */}
              <div className="lgx-panel">
                <div className="lgx-panel-head"><h2>แท็ก (Tags)</h2></div>
                <div className="lgx-panel-body">
                  <div className="lgx-chip-row" style={{ marginBottom: 8 }}>
                    {(productForm.tags || []).map((t, idx) => (
                      <button key={`${t}-${idx}`} type="button" className="lgx-chip is-active" onClick={() => removeTag(idx)}>{t} ×</button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input className="lgx-input" style={{ flex: 1 }} placeholder="พิมพ์แท็กแล้วกด Enter" value={tagInput} onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTags(tagInput) } }} />
                    <button type="button" className="lgx-btn" onClick={() => addTags(tagInput)}>เพิ่ม</button>
                  </div>
                  <div className="lgx-chip-row" style={{ marginTop: 8 }}>
                    {PRESET_TAGS.map(t => <button key={t} type="button" className="lgx-chip" onClick={() => addTags(t)}>{t}</button>)}
                  </div>
                </div>
              </div>

              {/* Card F: Admin notes */}
              <div className="lgx-panel">
                <div className="lgx-panel-head"><h2>บันทึกภายใน (Admin Notes)</h2></div>
                <div className="lgx-panel-body">
                  <textarea className="lgx-textarea" rows={3} value={productForm.admin_notes} onChange={(e) => setProductForm(prev => ({ ...prev, admin_notes: e.target.value }))} />
                </div>
              </div>

              <button type="button" className="lgx-btn lgx-btn-accent" style={{ width: '100%', padding: '10px 0' }} disabled={!canManage || actionState.status === 'working'} onClick={saveProduct}>
                {actionState.status === 'working' ? 'กำลังบันทึก...' : 'บันทึกสินค้า'}
              </button>
            </div>
          </div>

          {galleryCropSrc && (
            <CropModal
              src={galleryCropSrc}
              aspectRatio={1}
              onCancel={() => { setGalleryCropSrc(null); setGalleryCropIndex(null) }}
              onComplete={handleGalleryCropComplete}
              loading={loadingGalleryCrop}
            />
          )}
          {batchCropItems.length > 0 && (
            <BatchCropModal
              items={batchCropItems}
              aspectRatio={1}
              onCancel={() => setBatchCropItems([])}
              onComplete={handleBatchCropComplete}
            />
          )}
        </div>
      )}

      {/* ══════════ CATEGORIES VIEW ══════════ */}
      {view === 'categories' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="lgx-strip">
            <div className="lgx-stat"><div className="l">หมวดหมู่ทั้งหมด</div><div className="v">{categoryStats.total}</div></div>
            <div className="lgx-stat"><div className="l">หมวดหมู่หลัก</div><div className="v">{categoryStats.rootCount}</div></div>
            <div className="lgx-stat"><div className="l">หมวดหมู่ย่อย</div><div className="v">{categoryStats.subCount}</div></div>
            <div className="lgx-stat"><div className="l">แสดงอยู่ / ซ่อน</div><div className="v" style={{ fontSize: 15 }}>{categoryStats.visible} / {categoryStats.hidden}</div></div>
            <button type="button" className="lgx-stat is-clickable" disabled={!canManage} onClick={() => { setCategoryForm(DEFAULT_CATEGORY_FORM); setView('category-form') }}>
              <div className="l">&nbsp;</div><div className="v" style={{ color: 'var(--lgx-accent)', fontSize: 15 }}>+ เพิ่มหมวดหมู่หลัก</div>
            </button>
            <button type="button" className="lgx-stat is-clickable" disabled={!canManage} onClick={() => openAddSubcategory(null)}>
              <div className="l">&nbsp;</div><div className="v" style={{ color: 'var(--lgx-accent)', fontSize: 15 }}>+ เพิ่มหมวดหมู่ย่อย</div>
            </button>
          </div>

          <div className="lgx-panel">
            <div className="lgx-panel-body" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
              <input className="lgx-input" style={{ flex: '1 1 220px' }} placeholder="ค้นหาชื่อ / slug / #id..." value={categorySearch} onChange={(e) => setCategorySearch(e.target.value)} />
              <select className="lgx-select" style={{ flex: '0 0 150px' }} value={categoryStatusFilter} onChange={(e) => setCategoryStatusFilter(e.target.value)}>
                <option value="all">ทุกสถานะ</option>
                <option value="visible">แสดงอยู่</option>
                <option value="hidden">ซ่อนอยู่</option>
              </select>
              <div className="lgx-segmented" style={{ marginLeft: 'auto' }}>
                <span className="lgx-segmented-label">มุมมอง</span>
                <button type="button" className={`lgx-segmented-btn ${categoryLayout === 'tree' ? 'is-active' : ''}`} onClick={() => setCategoryLayout('tree')}>ต้นไม้</button>
                <button type="button" className={`lgx-segmented-btn ${categoryLayout === 'table' ? 'is-active' : ''}`} onClick={() => setCategoryLayout('table')}>ตาราง</button>
                <button type="button" className={`lgx-segmented-btn ${categoryLayout === 'grid' ? 'is-active' : ''}`} onClick={() => setCategoryLayout('grid')}>การ์ด</button>
              </div>
              {categoryLayout === 'tree' && <button type="button" className="lgx-btn" onClick={toggleExpandAll}>{expandedCategories.size >= categoryTree.length ? 'ยุบทั้งหมด' : 'ขยายทั้งหมด'}</button>}
            </div>
          </div>

          {/* ── TREE VIEW ── */}
          {categoryLayout === 'tree' && (
            <div className="lgx-panel">
              {categoryTree.map((root) => {
                const isExpanded = expandedCategories.has(Number(root.id))
                const hasChildren = Array.isArray(root.children) && root.children.length > 0
                const rootCount = products.filter(p => String(p.category_id) === String(root.id)).length
                return (
                  <div key={root.id} className="lgx-cat-node">
                    <div className="lgx-cat-node-head">
                      <button type="button" className="lgx-cat-chevron" onClick={() => toggleExpandCategory(Number(root.id))}>{isExpanded ? '▾' : '▸'}</button>
                      {root.image_url ? <img src={root.image_url} alt="" className="lgx-thumb" /> : <div className="lgx-thumb-empty">{root.icon || '📁'}</div>}
                      <div className="lgx-cat-node-body">
                        <div>
                          <div className="lgx-cat-name">
                            {root.icon && <span>{root.icon}</span>}
                            <span>{root.name}</span>
                            <span className="lgx-pill neutral">#{root.id}</span>
                            {root.is_hidden && <span className="lgx-pill neutral">ซ่อน</span>}
                          </div>
                          {root.description && <div className="lgx-cat-desc">{root.description}</div>}
                        </div>
                      </div>
                      <button type="button" className="lgx-btn" onClick={() => { setFilter(prev => ({ ...prev, categoryId: String(root.id) })); setView('products') }}>{rootCount} สินค้า</button>
                      <button type="button" className="lgx-btn" disabled={!canManage} onClick={() => openAddSubcategory(root)}>+ ย่อย</button>
                      <label className="lgx-checkbox-row"><input type="checkbox" checked={!root.is_hidden} disabled={!canManage} onChange={() => toggleCategoryHidden(root)} /></label>
                      <div className="lgx-btn-group">
                        <button type="button" className="lgx-icon-action" disabled={!canManage} onClick={() => editCategory(root)}>✎</button>
                        <button type="button" className="lgx-icon-action danger" disabled={!canManage} onClick={() => deleteCategory(root.id)}>✕</button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="lgx-cat-children">
                        {hasChildren ? root.children.map((sub, subIdx, subArr) => {
                          const subCount = products.filter(p => String(p.category_id) === String(sub.id)).length
                          return (
                            <div key={sub.id} className="lgx-cat-sub-row">
                              <span style={{ color: 'var(--lgx-text-muted)', fontFamily: 'var(--lgx-mono)' }}>↳</span>
                              {sub.image_url ? <img src={sub.image_url} alt="" className="lgx-thumb" style={{ width: 32, height: 32 }} /> : <div className="lgx-thumb-empty" style={{ width: 32, height: 32 }}>{sub.icon || '⚡'}</div>}
                              <div className="lgx-cat-sub-name">
                                {sub.icon && <span>{sub.icon}</span>}
                                <span>{sub.name}</span>
                                <span className="lgx-pill neutral">#{sub.id}</span>
                                {sub.is_hidden && <span className="lgx-pill neutral">ซ่อน</span>}
                              </div>
                              <code style={{ fontSize: 11, color: 'var(--lgx-text-muted)' }}>/{sub.slug}</code>
                              <button type="button" className="lgx-btn" onClick={() => { setFilter(prev => ({ ...prev, categoryId: String(sub.id) })); setView('products') }}>{subCount} สินค้า</button>
                              <label className="lgx-checkbox-row"><input type="checkbox" checked={!sub.is_hidden} disabled={!canManage} onChange={() => toggleCategoryHidden(sub)} /></label>
                              <div className="lgx-btn-group">
                                <button type="button" className="lgx-icon-action" disabled={!canManage || subIdx === 0} onClick={() => moveCategoryOrder(sub, 'up')}>↑</button>
                                <button type="button" className="lgx-icon-action" disabled={!canManage || subIdx === subArr.length - 1} onClick={() => moveCategoryOrder(sub, 'down')}>↓</button>
                                <button type="button" className="lgx-icon-action" disabled={!canManage} onClick={() => editCategory(sub)}>✎</button>
                                <button type="button" className="lgx-icon-action danger" disabled={!canManage} onClick={() => deleteCategory(sub.id)}>✕</button>
                              </div>
                            </div>
                          )
                        }) : (
                          <div className="lgx-cat-empty-children">
                            ยังไม่มีหมวดหมู่ย่อยในหมวดนี้ —{' '}
                            <button type="button" className="lgx-btn" disabled={!canManage} onClick={() => openAddSubcategory(root)}>+ เพิ่มหมวดหมู่ย่อยแรก</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
              {categoryTree.length === 0 && <div className="lgx-empty">ยังไม่มีหมวดหมู่สินค้าในระบบ</div>}
            </div>
          )}

          {/* ── TABLE VIEW ── */}
          {categoryLayout === 'table' && (
            <div className="lgx-panel">
              <div style={{ overflowX: 'auto' }}>
                <table className="lgx-table" style={{ width: '100%' }}>
                  <thead>
                    <tr><th>หมวดหมู่</th><th>หมวดหมู่หลัก</th><th>Slug</th><th>สินค้า</th><th>สถานะ</th><th style={{ textAlign: 'right' }}>จัดการ</th></tr>
                  </thead>
                  <tbody>
                    {filteredCategories.map(c => {
                      const count = products.filter(p => String(p.category_id) === String(c.id)).length
                      const parent = categories.find(p => Number(p.id) === Number(c.parent_id))
                      return (
                        <tr key={c.id}>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              {c.image_url ? <img src={c.image_url} alt="" className="lgx-thumb" /> : <div className="lgx-thumb-empty">{c.icon || (c.parent_id ? '⚡' : '📁')}</div>}
                              <div>
                                <div style={{ fontWeight: 700 }}>{c.icon && <span>{c.icon} </span>}{c.name} <span className="lgx-pill neutral">#{c.id}</span>{c.is_hidden && <span className="lgx-pill neutral">ซ่อน</span>}</div>
                                {c.description && <div style={{ fontSize: 11, color: 'var(--lgx-text-muted)' }}>{c.description}</div>}
                              </div>
                            </div>
                          </td>
                          <td>{parent ? `${parent.icon || '📁'} ${parent.name}` : <span className="lgx-pill neutral">หมวดหมู่หลัก</span>}</td>
                          <td className="mono">/{c.slug}</td>
                          <td><button type="button" className="lgx-btn" onClick={() => { setFilter(prev => ({ ...prev, categoryId: String(c.id) })); setView('products') }}>{count} รายการ</button></td>
                          <td><label className="lgx-checkbox-row"><input type="checkbox" checked={!c.is_hidden} disabled={!canManage} onChange={() => toggleCategoryHidden(c)} /></label></td>
                          <td>
                            <div className="lgx-btn-group" style={{ justifyContent: 'flex-end' }}>
                              <button type="button" className="lgx-icon-action" disabled={!canManage} onClick={() => editCategory(c)}>✎</button>
                              <button type="button" className="lgx-icon-action danger" disabled={!canManage} onClick={() => deleteCategory(c.id)}>✕</button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {filteredCategories.length === 0 && <div className="lgx-empty">ไม่พบหมวดหมู่ที่ตรงกับการค้นหา</div>}
              </div>
            </div>
          )}

          {/* ── GRID VIEW ── */}
          {categoryLayout === 'grid' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
              {filteredCategories.map(c => {
                const count = products.filter(p => String(p.category_id) === String(c.id)).length
                const parent = categories.find(p => Number(p.id) === Number(c.parent_id))
                return (
                  <div key={c.id} className="lgx-panel">
                    <div style={{ aspectRatio: '16/9', background: 'var(--lgx-surface-alt)', position: 'relative' }}>
                      {c.image_url ? <img src={c.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--lgx-text-muted)' }}>
                          <div style={{ fontSize: 26 }}>{c.icon || (c.parent_id ? '⚡' : '📁')}</div>
                        </div>
                      )}
                      <div style={{ position: 'absolute', top: 8, right: 8 }}>{!c.is_hidden ? <span className="lgx-pill ok">แสดง</span> : <span className="lgx-pill neutral">ซ่อน</span>}</div>
                      {parent && <div style={{ position: 'absolute', top: 8, left: 8 }}><span className="lgx-pill neutral">↳ {parent.name}</span></div>}
                    </div>
                    <div className="lgx-panel-body">
                      <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between' }}>
                        <span>{c.icon && <span>{c.icon} </span>}{c.name}</span>
                        <span className="lgx-pill neutral">#{c.id}</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--lgx-text-muted)', fontFamily: 'var(--lgx-mono)' }}>/{c.slug}</div>
                      {c.description && <div style={{ fontSize: 11.5, color: 'var(--lgx-text-muted)', marginTop: 4 }}>{c.description}</div>}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--lgx-border)' }}>
                        <button type="button" className="lgx-btn" onClick={() => { setFilter(prev => ({ ...prev, categoryId: String(c.id) })); setView('products') }}>{count} สินค้า</button>
                        <div className="lgx-btn-group">
                          <button type="button" className="lgx-icon-action" disabled={!canManage} onClick={() => editCategory(c)}>✎</button>
                          <button type="button" className="lgx-icon-action danger" disabled={!canManage} onClick={() => deleteCategory(c.id)}>✕</button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
              {filteredCategories.length === 0 && <div className="lgx-empty">ไม่พบหมวดหมู่ที่ตรงกับการค้นหา</div>}
            </div>
          )}

          {/* Delete Category with Reassignment Modal */}
          {deleteCategoryModal && (
            <div className="lgx-modal-backdrop" onClick={() => setDeleteCategoryModal(null)}>
              <div className="lgx-modal-card" onClick={(e) => e.stopPropagation()}>
                <div className="lgx-modal-head">
                  <strong>ยืนยันการลบหมวดหมู่</strong>
                  <button type="button" className="lgx-banner-close" onClick={() => setDeleteCategoryModal(null)}>×</button>
                </div>
                <div className="lgx-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>คุณกำลังจะลบหมวดหมู่: <strong>{deleteCategoryModal.category.name}</strong></div>
                  {(deleteCategoryModal.directProductsCount > 0 || deleteCategoryModal.childCatsCount > 0) && (
                    <div className="lgx-banner warn">
                      <span>หมวดหมู่นี้มี {deleteCategoryModal.directProductsCount} สินค้า และ {deleteCategoryModal.childCatsCount} หมวดหมู่ย่อยที่เชื่อมโยงอยู่</span>
                    </div>
                  )}
                  <div className="lgx-field">
                    <label>ย้ายสินค้าและหมวดหมู่ย่อยไปไว้ที่</label>
                    <select className="lgx-select" value={deleteCategoryModal.reassignTargetId} onChange={(e) => setDeleteCategoryModal(prev => ({ ...prev, reassignTargetId: e.target.value }))}>
                      <option value="">-- ไม่ย้าย (ปลดความสัมพันธ์เป็นอิสระ) --</option>
                      {categorySelectOptions.filter(c => Number(c.id) !== Number(deleteCategoryModal.category.id)).map(c => (
                        <option key={c.id} value={c.id}>{' '.repeat(c.depth * 3)}{c.depth > 0 ? '↳ ' : ''}{c.icon ? `${c.icon} ` : ''}{c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="lgx-modal-foot">
                  <button type="button" className="lgx-btn" onClick={() => setDeleteCategoryModal(null)}>ยกเลิก</button>
                  <button type="button" className="lgx-btn" style={{ color: 'var(--lgx-crit)' }} onClick={() => confirmDeleteCategory(deleteCategoryModal.category.id, deleteCategoryModal.reassignTargetId || null)}>ยืนยันลบหมวดหมู่</button>
                </div>
              </div>
            </div>
          )}

          {/* Quick Subcategory Creation Modal */}
          {quickSubModal && (
            <div className="lgx-modal-backdrop" onClick={() => setQuickSubModal(null)}>
              <div className="lgx-modal-card" onClick={(e) => e.stopPropagation()}>
                <div className="lgx-modal-head">
                  <strong>สร้างหมวดหมู่ย่อย</strong>
                  <button type="button" className="lgx-banner-close" onClick={() => setQuickSubModal(null)}>×</button>
                </div>
                <div className="lgx-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div className="lgx-field">
                    <label>หมวดหมู่หลักที่เป็นต้นสังกัด *</label>
                    <select className="lgx-select" value={quickSubModal.parentId} onChange={(e) => {
                      const p = categories.find(c => String(c.id) === String(e.target.value))
                      setQuickSubModal(prev => ({ ...prev, parentId: e.target.value, parentName: p ? p.name : '', parentIcon: p ? (p.icon || '📁') : '📁' }))
                    }}>
                      <option value="" disabled>-- กรุณาเลือกหมวดหมู่หลัก --</option>
                      {categories.filter(c => !c.parent_id).map(c => <option key={c.id} value={c.id}>{c.icon ? `${c.icon} ` : '📁 '}{c.name} (#{c.id})</option>)}
                    </select>
                  </div>
                  <div className="lgx-field">
                    <label>ไอคอน / Emoji</label>
                    <div className="lgx-icon-grid">
                      {['⚡', '🎮', '🔑', '💎', '📦', '👑', '🛡️', '🔥', '🎁', '🚀', '⭐', '🏷️'].map(em => (
                        <button key={em} type="button" className={`lgx-icon-btn ${quickSubModal.icon === em ? 'is-active' : ''}`} onClick={() => setQuickSubModal(prev => ({ ...prev, icon: em }))}>{em}</button>
                      ))}
                    </div>
                    <input className="lgx-input" style={{ marginTop: 8, maxWidth: 220 }} placeholder="Emoji อื่นๆ" value={quickSubModal.icon} onChange={(e) => setQuickSubModal(prev => ({ ...prev, icon: e.target.value }))} />
                  </div>
                  <div className="lgx-field">
                    <label>ชื่อหมวดหมู่ย่อย *</label>
                    <input className="lgx-input" autoFocus value={quickSubModal.name} onChange={(e) => {
                      const val = e.target.value
                      setQuickSubModal(prev => ({ ...prev, name: val, slug: !prev.slug || prev.slug === makeSlug(prev.name) ? makeSlug(val) : prev.slug }))
                    }} />
                  </div>
                  <div className="lgx-field">
                    <label>Slug (URL)</label>
                    <input className="lgx-input" style={{ fontFamily: 'var(--lgx-mono)' }} value={quickSubModal.slug} onChange={(e) => setQuickSubModal(prev => ({ ...prev, slug: e.target.value }))} />
                  </div>
                  <div className="lgx-field">
                    <label>คำอธิบายย่อ</label>
                    <textarea className="lgx-textarea" rows={2} value={quickSubModal.description} onChange={(e) => setQuickSubModal(prev => ({ ...prev, description: e.target.value }))} />
                  </div>
                </div>
                <div className="lgx-modal-foot" style={{ justifyContent: 'space-between' }}>
                  <button type="button" className="lgx-btn" onClick={() => {
                    const modal = quickSubModal
                    setQuickSubModal(null)
                    setView('category-form')
                    setCategoryForm({ ...DEFAULT_CATEGORY_FORM, parent_id: modal.parentId, name: modal.name, slug: modal.slug, icon: modal.icon, description: modal.description })
                  }}>เปิดฟอร์มเต็มรูปแบบ</button>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className="lgx-btn" onClick={() => setQuickSubModal(null)}>ยกเลิก</button>
                    <button type="button" className="lgx-btn lgx-btn-accent" disabled={actionState.status === 'working'} onClick={saveQuickSubcategory}>
                      {actionState.status === 'working' ? 'กำลังสร้าง...' : 'สร้างหมวดหมู่ย่อย'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════ CATEGORY FORM VIEW ══════════ */}
      {view === 'category-form' && (
        <div>
          <div className="lgx-panel" style={{ marginBottom: 14, position: 'sticky', top: 8, zIndex: 5 }}>
            <div className="lgx-panel-body" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button type="button" className="lgx-btn" onClick={() => setView('categories')}>← กลับหน้ารายการหมวดหมู่</button>
                <div>
                  <div style={{ fontWeight: 700 }}>{categoryForm.id ? `แก้ไขหมวดหมู่: ${categoryForm.name || `#${categoryForm.id}`}` : (categoryForm.parent_id ? 'เพิ่มหมวดหมู่ย่อย' : 'เพิ่มหมวดหมู่หลัก')}</div>
                  <div style={{ fontSize: 11, color: 'var(--lgx-text-muted)' }}>{categoryForm.id ? `รหัส #${categoryForm.id} • /category/${categoryForm.slug || '...'}` : 'กรอกข้อมูลเพื่อสร้างหมวดหมู่ใหม่'}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="lgx-btn" onClick={() => setView('categories')}>ยกเลิก</button>
                <button type="button" className="lgx-btn lgx-btn-accent" disabled={!canManage || actionState.status === 'working'} onClick={saveCategory}>
                  {actionState.status === 'working' ? 'กำลังบันทึก...' : 'บันทึกหมวดหมู่'}
                </button>
              </div>
            </div>
          </div>

          {errors.category && (
            <div className="lgx-banner crit" style={{ marginBottom: 14 }}>
              <span>{errors.category}</span>
              <button type="button" className="lgx-banner-close" onClick={() => setErrors(prev => ({ ...prev, category: '' }))}>×</button>
            </div>
          )}

          <div className="lgx-split">
            {/* LEFT COLUMN */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="lgx-panel">
                <div className="lgx-panel-head"><h2>ข้อมูลทั่วไปและโครงสร้าง</h2></div>
                <div className="lgx-panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div className="lgx-segmented">
                    <button type="button" className={`lgx-segmented-btn ${!categoryForm.parent_id ? 'is-active' : ''}`} onClick={() => setCategoryForm(prev => ({ ...prev, parent_id: '' }))}>หมวดหมู่หลัก</button>
                    <button type="button" className={`lgx-segmented-btn ${categoryForm.parent_id ? 'is-active' : ''}`} onClick={() => {
                      if (!categoryForm.parent_id) {
                        const firstRoot = categories.find(c => !c.parent_id && (!categoryForm.id || Number(c.id) !== Number(categoryForm.id)))
                        setCategoryForm(prev => ({ ...prev, parent_id: firstRoot ? String(firstRoot.id) : '' }))
                      }
                    }}>↳ หมวดหมู่ย่อย</button>
                  </div>
                  {categoryForm.parent_id ? (
                    <div className="lgx-field">
                      <label>เลือกหมวดหมู่หลักที่เป็นต้นสังกัด *</label>
                      <select className="lgx-select" value={categoryForm.parent_id} onChange={(e) => setCategoryForm(prev => ({ ...prev, parent_id: e.target.value }))}>
                        <option value="" disabled>-- กรุณาเลือกหมวดหมู่หลัก --</option>
                        {categorySelectOptions.map(c => (
                          <option key={c.id} value={c.id} disabled={c.isDisabled}>{' '.repeat(c.depth * 3)}{c.depth > 0 ? '↳ ' : ''}{c.icon ? `${c.icon} ` : ''}{c.name}{c.isDisabled ? ' (ห้ามเลือก)' : ''}</option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="lgx-banner info"><span>หมวดหมู่หลัก: จะแสดงผลเป็นหมวดหมู่ระดับบนสุดที่เมนูและหน้าร้าน</span></div>
                  )}
                  <div className="lgx-field">
                    <label>ไอคอน / Emoji หมวดหมู่</label>
                    <div className="lgx-icon-grid">
                      {PRESET_EMOJI_ICONS.map(em => (
                        <button key={em} type="button" className={`lgx-icon-btn ${categoryForm.icon === em ? 'is-active' : ''}`} onClick={() => setCategoryForm(prev => ({ ...prev, icon: em }))}>{em}</button>
                      ))}
                      <button type="button" className="lgx-chip" onClick={() => setCategoryForm(prev => ({ ...prev, icon: '' }))}>ล้างไอคอน</button>
                    </div>
                    <input className="lgx-input" style={{ marginTop: 8, maxWidth: 260 }} placeholder="พิมพ์ Emoji เช่น 🎮 หรือ ⚡" value={categoryForm.icon} onChange={(e) => setCategoryForm(prev => ({ ...prev, icon: e.target.value }))} />
                  </div>
                  <div className="lgx-form-grid">
                    <div className="lgx-field">
                      <label>ชื่อหมวดหมู่ *</label>
                      <input className="lgx-input" value={categoryForm.name} onChange={(e) => {
                        const val = e.target.value
                        setCategoryForm(prev => ({ ...prev, name: val, slug: !prev.id && (!prev.slug || prev.slug === makeSlug(prev.name)) ? makeSlug(val) : prev.slug }))
                      }} />
                    </div>
                    <div className="lgx-field">
                      <label>Slug (URL) *</label>
                      <input className="lgx-input" style={{ fontFamily: 'var(--lgx-mono)' }} value={categoryForm.slug} onChange={(e) => setCategoryForm(prev => ({ ...prev, slug: e.target.value }))} />
                    </div>
                    <div className="lgx-field">
                      <label>ลำดับการแสดงผล</label>
                      <input className="lgx-input" type="number" value={categoryForm.sort_order} onChange={(e) => setCategoryForm(prev => ({ ...prev, sort_order: Number(e.target.value) }))} />
                    </div>
                  </div>
                  <div className="lgx-field">
                    <label>คำอธิบายหมวดหมู่</label>
                    <textarea className="lgx-textarea" rows={2} value={categoryForm.description} onChange={(e) => setCategoryForm(prev => ({ ...prev, description: e.target.value }))} />
                  </div>
                </div>
              </div>

              <div className="lgx-panel">
                <div className="lgx-panel-head"><h2>รูปภาพหน้าปกหมวดหมู่</h2></div>
                <div className="lgx-panel-body">
                  <ImageUploadCropper
                    label="รูปภาพหน้าปก (Cover Image) *"
                    value={categoryForm.image_url}
                    onChange={(url) => setCategoryForm(prev => ({ ...prev, image_url: url }))}
                    aspectRatio={16 / 9}
                    helpText="อัปโหลดรูปภาพหน้าปกหมวดหมู่ หรือครอปสัดส่วน 16:9"
                  />
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, position: 'sticky', top: 84 }}>
              <div className="lgx-panel">
                <div className="lgx-panel-head"><h2>ตัวอย่างการ์ดหน้าร้าน</h2></div>
                <div className="lgx-panel-body">
                  <div style={{ border: '1.5px solid var(--lgx-border)', borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
                    <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 2 }}>{!categoryForm.is_hidden ? <span className="lgx-pill ok">แสดง</span> : <span className="lgx-pill neutral">ซ่อน</span>}</div>
                    {categoryForm.parent_id && (
                      <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 2 }}>
                        <span className="lgx-pill neutral">↳ {categories.find(c => String(c.id) === String(categoryForm.parent_id))?.name || 'หมวดหมู่หลัก'}</span>
                      </div>
                    )}
                    <div style={{ aspectRatio: '16/9', background: 'var(--lgx-surface-alt)' }}>
                      {categoryForm.image_url ? <img src={categoryForm.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--lgx-text-muted)' }}>
                          <div style={{ fontSize: 26 }}>{categoryForm.icon || '📁'}</div>
                          <span style={{ fontSize: 11 }}>ไม่มีรูปภาพหน้าปก</span>
                        </div>
                      )}
                    </div>
                    <div style={{ padding: 10 }}>
                      <div style={{ fontWeight: 700 }}>{categoryForm.icon && <span>{categoryForm.icon} </span>}{categoryForm.name || 'ชื่อหมวดหมู่ตัวอย่าง'}</div>
                      <div style={{ fontSize: 11, color: 'var(--lgx-text-muted)', fontFamily: 'var(--lgx-mono)' }}>/{categoryForm.slug || makeSlug(categoryForm.name) || '...'}</div>
                      {categoryForm.description && <div style={{ fontSize: 11.5, color: 'var(--lgx-text-muted)', marginTop: 4 }}>{categoryForm.description}</div>}
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--lgx-border)' }}>
                        <span style={{ fontSize: 11.5, color: 'var(--lgx-text-muted)' }}>{categoryForm.id ? `${products.filter(p => String(p.category_id) === String(categoryForm.id)).length} สินค้า` : '0 สินค้า'}</span>
                        <span className="lgx-pill neutral">ดูสินค้าทั้งหมด →</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="lgx-panel">
                <div className="lgx-panel-head"><h2>สถานะการแสดงผล</h2></div>
                <div className="lgx-panel-body">
                  <label className="lgx-checkbox-row"><input type="checkbox" checked={!categoryForm.is_hidden} onChange={(e) => setCategoryForm(prev => ({ ...prev, is_hidden: !e.target.checked }))} /> เปิดแสดงหมวดหมู่นี้ที่หน้าแรก</label>
                </div>
              </div>

              {categoryForm.id && (
                <div className="lgx-panel">
                  <div className="lgx-panel-head"><h2>สินค้าในหมวดหมู่นี้</h2><span>{products.filter(p => String(p.category_id) === String(categoryForm.id)).length} ชิ้น</span></div>
                  <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                    {products.filter(p => String(p.category_id) === String(categoryForm.id)).map(p => (
                      <div key={p.id} className="lgx-row" style={{ padding: '8px 18px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                          {p.image_url ? <img src={p.image_url} alt="" className="lgx-thumb" style={{ width: 28, height: 28 }} /> : <div className="lgx-thumb-empty" style={{ width: 28, height: 28 }} />}
                          <span className="label" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                        </div>
                        <span style={{ fontFamily: 'var(--lgx-mono)', fontWeight: 700 }}>฿{formatNumber(p.price)}</span>
                      </div>
                    ))}
                    {products.filter(p => String(p.category_id) === String(categoryForm.id)).length === 0 && <div className="lgx-empty">ยังไม่มีสินค้าที่เชื่อมโยงกับหมวดหมู่นี้</div>}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="lgx-btn lgx-btn-accent" style={{ flex: 1, padding: '10px 0' }} disabled={!canManage || actionState.status === 'working'} onClick={saveCategory}>บันทึกหมวดหมู่</button>
                <button type="button" className="lgx-btn" onClick={() => setView('categories')}>ยกเลิก</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
