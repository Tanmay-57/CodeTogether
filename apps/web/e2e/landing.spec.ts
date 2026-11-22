import { expect, test } from '@playwright/test'

test('the landing background follows the pointer and the call panel can be widened', async ({ page }) => {
  await page.goto('/')
  const reduced = await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const landing = page.locator('.landing')
  if (reduced) {
    await landing.dispatchEvent('pointermove', { clientX: 400, clientY: 240 })
    await expect.poll(() => landing.evaluate((node) => (node as HTMLElement).style.getPropertyValue('--mx'))).toBe('')
  } else {
    await landing.dispatchEvent('pointermove', { clientX: 80, clientY: 120 })
    const first = await landing.evaluate((node) => (node as HTMLElement).style.getPropertyValue('--mx'))
    await landing.dispatchEvent('pointermove', { clientX: 900, clientY: 400 })
    const second = await landing.evaluate((node) => (node as HTMLElement).style.getPropertyValue('--mx'))
    expect(first).not.toBe('')
    expect(second).not.toBe(first)
    await expect(page.getByTestId('landing-preview')).toContainText('Lin is typing', { timeout: 8000 })
  }

  await page.getByTestId('display-name').fill('Ada')
  await page.getByTestId('create-room').click()
  await page.getByTestId('prejoin-join').click()
  await expect(page.getByTestId('monaco-host')).toBeVisible()
  const handle = page.getByRole('separator', { name: 'Resize call panel' })
  const box = await handle.boundingBox()
  expect(box).not.toBeNull()
  await page.mouse.move(box!.x + 2, box!.y + 40)
  await page.mouse.down()
  await page.mouse.move(box!.x - 80, box!.y + 40)
  await page.mouse.up()
  const width = await page.locator('.workspace-grid').evaluate((node) => getComputedStyle(node).getPropertyValue('--panel-width').trim())
  expect(Number.parseFloat(width)).toBeGreaterThan(320)
})

test('reduced motion shows the finished landing preview without typing', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const preview = page.getByTestId('landing-preview')
  await expect(preview).toContainText("return change.intent === 'ship'")
  await expect(preview).toContainText('Lin')
  const before = await preview.innerText()
  await page.waitForTimeout(700)
  expect(await preview.innerText()).toBe(before)
  await expect(preview).not.toContainText('Lin is typing')
})

test('landing page validates the name and room code before leaving home', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Code together. Think together.' })).toBeVisible()
  await page.getByTestId('create-room').click()
  await expect(page.getByRole('alert').first()).toContainText('display name')

  await page.getByTestId('display-name').fill('Ada')
  await page.getByTestId('room-code').fill('nope')
  await page.getByTestId('join-room').click()
  await expect(page.getByRole('alert').last()).toContainText('room code')
  await expect(page).toHaveURL('/')
})

test('theme toggle and the join form are keyboard reachable', async ({ page }) => {
  await page.goto('/')
  const theme = page.getByRole('button', { name: /theme/i })
  for (let step = 0; step < 8; step += 1) {
    if (await theme.evaluate((element) => element === document.activeElement)) break
    await page.keyboard.press('Tab')
  }
  await expect(theme).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('html')).not.toHaveClass(/dark/)

  await page.getByTestId('display-name').focus()
  await page.keyboard.press('Tab')
  await expect(page.getByTestId('room-lock')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByTestId('create-room')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByTestId('room-code')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByTestId('join-room')).toBeFocused()
})
