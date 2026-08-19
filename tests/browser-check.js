"use strict";

const assert=require("node:assert/strict");
const {chromium}=require("playwright");

(async()=>{
  const browser=await chromium.launch({
    headless:true,
    executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  });
  const results=[];
  try{
    for(const viewport of [{name:"desktop",width:1280,height:900},{name:"iphone",width:390,height:844}]){
      const page=await browser.newPage({viewport:{width:viewport.width,height:viewport.height}});
      const errors=[];
      page.on("console",message=>{if(message.type()==="error")errors.push(message.text())});
      page.on("pageerror",error=>errors.push(error.message));
      await page.goto("http://127.0.0.1:4173/visual-test",{waitUntil:"networkidle"});
      await page.waitForSelector("#statusBadge:not(:empty)");
      assert.equal(await page.locator("#weatherNote a").textContent(),"Weather data by Foreca");
      assert.ok((await page.locator("#nightOutlook .night-option").count())>1);
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth);
      assert.equal(overflow,false,`${viewport.name} has horizontal overflow`);
      await page.locator('[data-info="transparency"]').first().click();
      await page.waitForSelector("#infoDialog[open]");
      assert.match(await page.locator("#infoTitle").textContent(),/Transparency/);
      await page.locator("#infoClose").click();
      await page.screenshot({path:`/private/tmp/astro-image-now-v1.9-${viewport.name}-dashboard.png`,fullPage:true});
      await page.locator("#settingsBtn").click();
      await page.selectOption("#weatherSource","open-meteo");
      assert.equal(await page.locator("#forecaTokenField").evaluate(element=>element.classList.contains("hidden")),true);
      await page.selectOption("#weatherSource","foreca-fallback");
      assert.equal(await page.locator("#forecaTokenField").evaluate(element=>element.classList.contains("hidden")),false);
      assert.deepEqual(errors,[],`${viewport.name} browser errors`);
      await page.screenshot({path:`/private/tmp/astro-image-now-v1.9-${viewport.name}-settings.png`,fullPage:true});
      results.push(`${viewport.name}: provider, dialog, responsive layout, and console checks passed`);
      await page.close();
    }
    console.log(results.join("\n"));
  }finally{
    await browser.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1});
