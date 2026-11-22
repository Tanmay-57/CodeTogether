import { expect, test } from '@playwright/test'

async function joinWorkspace(page: import('@playwright/test').Page, name: string, path?: string) {
  if (path) await page.goto(path)
  else {
    await page.goto('/')
    await page.getByTestId('display-name').fill(name)
    await page.getByTestId('create-room').click()
  }
  await expect(page.getByTestId('prejoin-name')).toBeVisible()
  if (path) await page.getByTestId('prejoin-name').fill(name)
  await page.getByTestId('prejoin-join').click()
  await expect(page.getByTestId('monaco-host')).toBeVisible()
  await expect(page.getByTestId('connection-status')).toContainText('Connected')
}

test('two browsers edit the same document, then the code can be downloaded', async ({ browser }) => {
  const adaContext = await browser.newContext()
  const linContext = await browser.newContext()
  const ada = await adaContext.newPage()
  const lin = await linContext.newPage()

  await joinWorkspace(ada, 'Ada')
  const roomPath = new URL(ada.url()).pathname
  await joinWorkspace(lin, 'Lin', roomPath)

  await ada.getByTestId('monaco-host').click()
  await ada.keyboard.type('alpha')
  await expect(lin.getByTestId('document-text')).toHaveText('alpha')
  await expect.poll(() => lin.evaluate(() => [...document.querySelectorAll('style')].map((node) => node.textContent ?? '').join('\n'))).toContain('content:"Ada"')
  await expect.poll(() => lin.locator('.yRemoteSelectionHead').count()).toBeGreaterThan(0)
  const typing = lin.getByText('Typing')
  await typing.scrollIntoViewIfNeeded()
  await expect(typing).toBeVisible()

  await lin.getByTestId('monaco-host').click()
  await lin.keyboard.press('End')
  await lin.keyboard.type('beta')
  await expect(ada.getByTestId('document-text')).toHaveText('alphabeta')

  const downloadPromise = ada.waitForEvent('download')
  await ada.getByTestId('download-code').click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('main.js')

  await ada.getByTestId('leave-room').click()
  await expect(ada).toHaveURL('/')
  await adaContext.close()
  await linContext.close()
})

test('a lock word, chat, another file, and clear output work for the room', async ({ browser }) => {
  const adaContext = await browser.newContext()
  const linContext = await browser.newContext()
  const ada = await adaContext.newPage()
  const lin = await linContext.newPage()

  await ada.goto('/')
  await ada.getByTestId('display-name').fill('Ada')
  await ada.getByTestId('room-lock').fill('quiet')
  await ada.getByTestId('create-room').click()
  await ada.getByTestId('prejoin-join').click()
  await expect(ada.getByTestId('monaco-host')).toBeVisible()
  const roomPath = new URL(ada.url()).pathname

  await lin.goto(roomPath)
  await lin.getByTestId('prejoin-name').fill('Lin')
  await lin.getByTestId('prejoin-join').click()
  await expect(lin.getByRole('alert')).toContainText('lock word')
  await lin.getByTestId('prejoin-lock').fill('quiet')
  await lin.getByTestId('prejoin-join').click()
  await expect(lin.getByTestId('monaco-host')).toBeVisible()

  await ada.getByTestId('monaco-host').click()
  await ada.keyboard.type("console.log('hi')")
  await expect(lin.getByTestId('document-text')).toContainText("console.log('hi')")
  await ada.getByTestId('run-code').click()
  await expect(lin.getByTestId('terminal-output')).toContainText('hi')
  await ada.getByTestId('clear-output').click()
  await expect(ada.getByTestId('terminal-output')).not.toContainText('hi')
  await expect(lin.getByTestId('terminal-output')).not.toContainText('hi')

  await ada.getByTestId('open-chat').click()
  await lin.getByTestId('open-chat').click()
  await ada.getByTestId('room-chat').fill('hello from ada')
  await expect(lin.getByTestId('chat-typing')).toHaveText('Ada is typing')
  await ada.getByRole('button', { name: 'Send' }).click()
  await expect(lin.getByText('hello from ada')).toBeVisible()
  await expect(lin.getByTestId('chat-typing')).toHaveCount(0)

  await ada.getByTestId('add-file').click()
  const addedFile = lin.getByRole('button', { name: /^file-\d+\.js$/ })
  await expect(addedFile).toBeVisible()
  await ada.getByRole('button', { name: /^Close file-/ }).click()
  await expect(addedFile).toHaveCount(0)

  await ada.getByTestId('language-select').selectOption('python')
  await ada.getByTestId('add-file').click()
  const pythonFile = lin.getByRole('button', { name: /^file-\d+\.py$/ })
  await expect(pythonFile).toBeVisible()
  await ada.getByRole('button', { name: /^Close file-.*\.py$/ }).click()
  await expect(pythonFile).toHaveCount(0)

  await ada.getByTestId('open-file-input').setInputFiles({
    name: 'notes.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('# hello from a file'),
  })
  const opened = lin.getByRole('button', { name: 'notes.md', exact: true })
  await expect(opened).toBeVisible()
  await opened.click()
  await expect(lin.getByTestId('document-text')).toContainText('# hello from a file')

  await ada.getByTestId('open-chat').click()
  const callBox = await ada.getByTestId('call-section').boundingBox()
  const columnBox = await ada.locator('aside').boundingBox()
  if (!callBox || !columnBox) throw new Error('missing call column')
  expect(columnBox.height - callBox.height).toBeLessThan(8)

  await adaContext.close()
  await linContext.close()
})

test('both browsers see the output of a JavaScript run', async ({ browser }) => {
  const adaContext = await browser.newContext()
  const linContext = await browser.newContext()
  const ada = await adaContext.newPage()
  const lin = await linContext.newPage()

  await joinWorkspace(ada, 'Ada')
  const roomPath = new URL(ada.url()).pathname
  await joinWorkspace(lin, 'Lin', roomPath)

  await ada.getByTestId('monaco-host').click()
  await ada.keyboard.type("console.log('hi')")
  await expect(lin.getByTestId('document-text')).toContainText("console.log('hi')")
  await ada.getByTestId('run-code').click()
  await expect(ada.getByTestId('terminal-output')).toContainText('hi')
  await expect(lin.getByTestId('terminal-output')).toContainText('hi')

  await adaContext.close()
  await linContext.close()
})

test('the terminal accepts a line of input and can be dragged taller', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('display-name').fill('Ada')
  await page.getByTestId('create-room').click()
  await page.getByTestId('prejoin-join').click()
  await expect(page.getByTestId('monaco-host')).toBeVisible()
  await expect(page.getByTestId('sync-label')).toHaveText('Synced')
  await page.getByTestId('monaco-host').click()
  await page.keyboard.type("process.stdin.once('data', (c) => console.log('got:' + String(c).trim()))")
  await page.getByTestId('run-code').click()
  const output = page.getByTestId('terminal-output')
  await expect(page.getByPlaceholder('Type input and press Enter')).toHaveCount(0)
  await expect(page.getByText('Running')).toBeVisible()
  await output.click()
  await page.keyboard.type('5')
  await page.keyboard.press('Enter')
  await expect(output).toContainText('got:5')

  const terminal = page.getByRole('region', { name: 'Terminal' })
  const before = await terminal.evaluate((node) => node.getBoundingClientRect().height)
  const handle = page.getByRole('separator', { name: 'Resize terminal' })
  const box = await handle.boundingBox()
  expect(box).not.toBeNull()
  await page.mouse.move(box!.x + 24, box!.y + 1)
  await page.mouse.down()
  await page.mouse.move(box!.x + 24, box!.y - 100)
  await page.mouse.up()
  await expect.poll(() => terminal.evaluate((node) => node.getBoundingClientRect().height)).toBeGreaterThan(before + 40)

  await page.reload()
  await expect(page.getByTestId('monaco-host')).toBeVisible()
  await expect.poll(() => page.getByRole('region', { name: 'Terminal' }).evaluate((node) => node.getBoundingClientRect().height)).toBeGreaterThan(before + 40)
})

test('a narrow viewport still shows download and the editing note', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByTestId('display-name').fill('Noa')
  await page.getByTestId('create-room').click()
  await page.getByTestId('prejoin-join').click()
  await expect(page.getByText('Extended code editing is meant for a larger screen.')).toBeVisible()
  await expect(page.getByTestId('download-code')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Leave call' })).toBeVisible()
  await expect(page.getByTestId('copy-link')).toBeVisible()
})
