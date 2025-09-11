import test, { expect } from '@playwright/test'

test.describe('Test Notes',()=>{
    test.beforeEach(async ({ page }) => {
      await page.goto('http://localhost:5173/');
    });
    test('test page title',async({page})=>{
        const title=page.locator('h1#main-heading',{hasText:'Note'})
        await expect(title).toHaveText('Notes')
    })
    test("create a new note",async({page})=>{
         await page.pause()
        const new_todo='Hello World'
        const defaultItemsCount=await page.locator('#notes-list > ul > li').count()
        await page.getByRole('textbox').fill(new_todo)
        await page.getByRole('button').click()
        const items=page.locator('#notes-list > ul')
        await expect(items).toContainText(new_todo)
        const modifiedArrayCount=await page.locator('#notes-list > ul > li').count()
        expect(modifiedArrayCount).toEqual(defaultItemsCount+1)
    })
})