const express = require('express');
const puppeteer = require('puppeteer');
const app = express();
const PORT = 3000;

// Global değişkende en son çekilen verileri tutuyoruz.
let scrapedData = {
  altinVeriler: [],
  darphaneVeriler: []
};

(async () => {
  // Puppeteer'ı headless modda başlatıyoruz.
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  // Hedef sayfayı ziyaret ediyoruz.
  await page.goto('https://canlipiyasalar.haremaltin.com/', { waitUntil: 'networkidle2' });

  // Verileri çekme fonksiyonunu tanımlıyoruz.
  const fetchData = async () => {
    try {
      // 1) ALTIN FİYATLARI (ilk tablo: isim, alış, satış)
      const altinVeriler = await page.$$eval('table.table:nth-of-type(1) tr', rows => {
        return rows.map(row => {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 3) {
            return {
              isim: cells[0].textContent.trim(),
              alis: cells[1].textContent.trim(),
              satis: cells[2].textContent.trim(),
            };
          }
          return null;
        }).filter(Boolean).slice(0, 26);
      });

      // 2) DARBHANE İŞÇİLİK FİYATLARI (ikinci tablo: isim, yeniAlis, yeniSatis, eskiAlis, eskiSatis)
      // (Burada doğru tablo indeksini belirlemek önemli; örnekte ikinci tabloyu varsayıyoruz.)
      const darphaneVeriler = await page.$$eval('table.table:nth-of-type(1) tr', rows => {
        return rows.map(row => {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 5) {
            const isimLink = cells[0].querySelector('a.item.title');
            const isim = isimLink ? isimLink.textContent.trim() : cells[0].textContent.trim();
            return {
              isim,
              yeniAlis: cells[1].textContent.trim(),
              yeniSatis: cells[2].textContent.trim(),
              eskiAlis: cells[3].textContent.trim(),
              eskiSatis: cells[4].textContent.trim(),
            };
          }
          return null;
        }).filter(Boolean);
      });

      // Global değişkeni güncelliyoruz.
      scrapedData = { altinVeriler, darphaneVeriler };
      console.log('Veriler güncellendi:', scrapedData);
    } catch (err) {
      console.error('Veri çekme hatası:', err);
    }
  };

  // İlk veriyi hemen çekiyoruz
  await fetchData();
  // Sonrasında her 30 saniyede bir verileri güncelliyoruz.
  setInterval(fetchData, 5000);
  // Tarayıcıyı kapatmıyoruz; böylece sürekli veri çekmeye devam ediyoruz.
})();

// Express sunucusuna statik dosyaların bulunduğu klasörü tanımlıyoruz.
app.use(express.static('public'));

// API endpoint'i: en güncel verileri JSON formatında döndürüyor.
app.get('/api/data', (req, res) => {
  res.json(scrapedData);
});

app.listen(PORT, () => {
  console.log(`Sunucu http://localhost:${PORT} adresinde çalışıyor`);
});
