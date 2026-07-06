import fs from 'fs';
import puppeteer from 'puppeteer';

(async () => {
  console.log("Iniciando navegador...");
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  // Bloquear recursos innecesarios para que cargue más rápido
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (['font', 'media'].includes(req.resourceType())) {
      req.abort();
    } else {
      req.continue();
    }
  });

  console.log("Navegando a la galería...");
  await page.goto('https://gf2exilium.sunborngame.com/main/art', { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Esperar a que cargue la galería Vue
  await page.waitForSelector('.art-div');
  
  // Extraer las URLs iterando por las 8 páginas
  const allImageUrls = await page.evaluate(async () => {
    const vue = document.querySelector('.art-div').__vue__;
    if (!vue) return [];
    
    let urls = [];
    
    for (let i = 1; i <= 8; i++) {
      // Cambiar de página invocando el método de Vue
      vue.wallpaperPaginationChange(i);
      
      // Esperar 1.5 segundos para que Vue actualice el listado desde la API
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Extraer las URLs de esta página (el parámetro suele ser downloadUrl, img_url, o picture)
      const pageUrls = vue._data.wallpaperList.map(item => {
        // En base a la inspección previa, buscaremos la imagen en máxima resolución
        return item.downloadUrl || item.picture || item.img_url || item.url || item.pic;
      });
      
      urls = urls.concat(pageUrls);
    }
    
    // Filtrar falsos positivos o nulos y devolver únicas
    return Array.from(new Set(urls.filter(Boolean)));
  });

  console.log("\nSe encontraron " + allImageUrls.length + " imágenes en alta resolución.");
  
  // Guardar a un archivo JSON para que la app principal lo pueda usar
  fs.writeFileSync('src/backgrounds.json', JSON.stringify(allImageUrls, null, 2));
  console.log("Resultados guardados en src/backgrounds.json");

  await browser.close();
})();
