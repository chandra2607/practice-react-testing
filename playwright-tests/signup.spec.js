import { test, expect } from '@playwright/test'

test.describe('Signup multi-step form', () => {
  test.beforeEach(async ({ page }) => {
    // clear any forced flags
    await page.goto('/')
    await page.evaluate(() => { window.__MOCK_SIGNUP_FORCE_FAIL = false })
  })

  test('shows notes and signup sections', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('#main-heading')).toHaveText('Notes')
    await expect(page.locator('text=Create an Account')).toBeVisible()
  })

  test('validates each step and submits successfully', async ({ page }) => {
    await page.goto('/')

    // Step 1: try next without filling -> should show errors
    await page.click('text=Next')
    await expect(page.locator('.field-error', { hasText: 'is required' }).first()).toBeVisible()

    // Fill Step 1
    await page.fill('input[name="firstName"]', 'Alice')
    await page.fill('input[name="lastName"]', 'Smith')
    await page.fill('input[name="email"]', 'alice@example.com')
    await page.fill('input[name="phone"]', '9123456789')
    await page.click('text=Next')
    await expect(page.locator('fieldset:has-text("Address")')).toBeVisible()

    // Step 2: missing city/postal
    await page.fill('input[name="address1"]', '12 Main St')
    await page.click('text=Next')
    await expect(page.locator('.field-error', { hasText: 'City is required' }).first()).toBeVisible()

    // Fill Step 2
    await page.fill('input[name="city"]', 'Metropolis')
    await page.fill('input[name="postal"]', '12345')
    await page.click('text=Next')
    await expect(page.locator('fieldset:has-text("Account")')).toBeVisible()

    // Step 3: weak password
    await page.fill('input[name="username"]', 'alice')
    await page.fill('input[name="password"]', 'short')
    await page.fill('input[name="confirmPassword"]', 'short')
    await page.click('text=Next')
    await expect(page.locator('.field-error', { hasText: 'at least 8' }).first()).toBeVisible()

    // valid password
    await page.fill('input[name="password"]', 's3curepass')
    await page.fill('input[name="confirmPassword"]', 's3curepass')
    await page.click('text=Next')
    await expect(page.locator('fieldset:has-text("Preferences")')).toBeVisible()

    // Step 4: choose preferences and submit
    await page.check('input[value="tech"]')
    await page.check('input[name="newsletter"]')

    await page.click('text=Submit')

    // expect thank you shown
    await expect(page.locator('text=Thank you!')).toBeVisible()
  })

  test('shows API failure and does not proceed', async ({ page }) => {
    await page.goto('/')
    // force API to fail
    await page.evaluate(() => { window.__MOCK_SIGNUP_FORCE_FAIL = true })

    // Fill required fields quickly
    await page.fill('input[name="firstName"]', 'Fail')
    await page.fill('input[name="lastName"]', 'Case')
    await page.fill('input[name="email"]', 'fail@example.com')
    await page.fill('input[name="phone"]', '6111111111')
    await page.click('text=Next')
    await page.fill('input[name="address1"]', '1 Error Rd')
    await page.fill('input[name="city"]', 'Nowhere')
    await page.fill('input[name="postal"]', '00000')
    await page.click('text=Next')
    await page.fill('input[name="username"]', 'failcase')
    await page.fill('input[name="password"]', 'password1')
    await page.fill('input[name="confirmPassword"]', 'password1')
    await page.click('text=Next')

    await page.check('input[value="music"]')
    await page.click('text=Submit')

    // API error should be displayed and no thank you
    await expect(page.locator('.form-error')).toContainText('Server error')
    await expect(page.locator('text=Thank you!')).not.toBeVisible()
  })
})
