import test from 'node:test'
import assert from 'node:assert/strict'
import * as dbFacade from '../db.js'
import * as dbPool from '../db/pool.js'
import * as dbUsers from '../db/users.js'
import * as dbTopups from '../db/topups.js'
import * as dbStock from '../db/stock.js'
import * as dbCatalog from '../db/catalog.js'
import * as dbOrders from '../db/orders.js'
import * as dbGrowth from '../db/growth.js'
import * as dbSupport from '../db/support.js'
import * as dbMessages from '../db/messages.js'
import * as dbSettings from '../db/settings.js'
import * as dbInit from '../db/init.js'

test('dbFacade exports pool and query wrappers', () => {
  assert.ok(dbFacade.pool)
  assert.equal(typeof dbFacade.query, 'function')
  assert.equal(typeof dbFacade.get, 'function')
  assert.equal(typeof dbFacade.all, 'function')
  assert.equal(typeof dbFacade.generateOrderRef, 'function')
})

test('dbFacade exports users and auth functions', () => {
  assert.equal(typeof dbFacade.getUserById, 'function')
  assert.equal(typeof dbFacade.getUserByEmail, 'function')
  assert.equal(typeof dbFacade.registerUser, 'function')
  assert.equal(typeof dbFacade.createSession, 'function')
  assert.equal(typeof dbFacade.getSession, 'function')
})

test('dbFacade exports catalog and stock functions', () => {
  assert.equal(typeof dbFacade.createProduct, 'function')
  assert.equal(typeof dbFacade.listProducts, 'function')
  assert.equal(typeof dbFacade.createCategory, 'function')
  assert.equal(typeof dbFacade.adminCreateStockPool, 'function')
})

test('dbFacade exports order and fulfillment functions', () => {
  assert.equal(typeof dbFacade.purchaseDigitalProduct, 'function')
  assert.equal(typeof dbFacade.purchaseUidProduct, 'function')
  assert.equal(typeof dbFacade.purchaseFarmProduct, 'function')
  assert.equal(typeof dbFacade.listMyOrders, 'function')
})

test('dbFacade exports topups and growth functions', () => {
  assert.equal(typeof dbFacade.getWallet, 'function')
  assert.equal(typeof dbFacade.createTopup, 'function')
  assert.equal(typeof dbFacade.creditPointsForTopup, 'function')
  assert.equal(typeof dbFacade.redeemCoupon, 'function')
  assert.equal(typeof dbFacade.listActiveGrowthCampaigns, 'function')
})

test('dbFacade exports support, messages, and settings functions', () => {
  assert.equal(typeof dbFacade.createSupportTicket, 'function')
  assert.equal(typeof dbFacade.listAnnouncementsPublic, 'function')
  assert.equal(typeof dbFacade.getUiSettings, 'function')
  assert.equal(typeof dbFacade.initDbPg, 'function')
})

test('Direct module imports work for all sub-modules', () => {
  assert.equal(typeof dbPool.pool.query, 'function')
  assert.equal(typeof dbUsers.getUserById, 'function')
  assert.equal(typeof dbTopups.getWallet, 'function')
  assert.equal(typeof dbStock.adminCreateStockPool, 'function')
  assert.equal(typeof dbCatalog.createProduct, 'function')
  assert.equal(typeof dbOrders.purchaseDigitalProduct, 'function')
  assert.equal(typeof dbGrowth.redeemCoupon, 'function')
  assert.equal(typeof dbSupport.createSupportTicket, 'function')
  assert.equal(typeof dbMessages.listAnnouncementsPublic, 'function')
  assert.equal(typeof dbSettings.getUiSettings, 'function')
  assert.equal(typeof dbInit.initDbPg, 'function')
})
