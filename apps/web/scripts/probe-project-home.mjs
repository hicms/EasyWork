import {readFile,mkdir} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
let login;for(let i=0;i<100;i++){login=(await readFile('.test-runtime/upgrade-017/preview-server.log','utf8')).match(/http:\/\/127\.0\.0\.1:18989\/\?token=[\w-]+/)?.[0];if(login)break;await new Promise(r=>setTimeout(r,1000))}if(!login)throw Error('Preview not ready');
const browser=await chromium.launch();try{
const p=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(login);await p.getByRole('button',{name:'项目',exact:true}).click();await expect(p.getByRole('heading',{name:'让想法，有处安放。',exact:true})).toBeVisible();await mkdir('.artifacts/project-home',{recursive:true});
await p.getByRole('button',{name:'Settings',exact:true}).click();await p.getByRole('button',{name:'System',exact:true}).click();await p.getByRole('button',{name:'Close',exact:true}).click();
for(const theme of ['light','dark']){await p.emulateMedia({colorScheme:theme});await p.waitForTimeout(300);await p.screenshot({path:'.artifacts/project-home/'+theme+'.png'});}
await p.getByLabel('搜索项目',{exact:true}).fill('不存在的项目xyz');await expect(p.locator('.wd-project-overview').getByRole('status')).toHaveText('没有找到匹配的项目');await expect(p.locator('.wd-project-table tbody tr')).toHaveCount(0);await p.getByLabel('搜索项目',{exact:true}).fill('');await expect(p.getByRole('table').getByRole('button',{name:/^打开/}).first()).toBeVisible();
await p.getByText('从模板创建',{exact:true}).click();await p.locator('.wd-project-templates').getByRole('button').first().click();await expect(p.locator('.wd-p-create-modal')).toBeVisible();await expect(p.locator('.wd-p-create-modal').getByPlaceholder('请输入项目名称')).not.toBeEmpty();await p.locator('.wd-p-create-modal').getByRole('button',{name:'取消',exact:true}).click();
await p.setViewportSize({width:600,height:850});await p.screenshot({path:'.artifacts/project-home/narrow.png'});expect(await p.locator('.wd-project-overview').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);expect(errors).toEqual([]);console.log('PASS project homepage themes, search, template, narrow overflow');
}finally{await browser.close()}
