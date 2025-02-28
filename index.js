const express = require('express');
const puppeteer = require('puppeteer');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Global değişkende en son çekilen verileri tutuyoruz.
let scrapedData = {
  altinVeriler: [],
  darphaneVeriler: []
};

(async () => {
  // Puppeteer'ı headless modda başlatıyoruz.
  const browser = await puppeteer.launch({ 
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--single-process',
      '--no-zygote',
    ], // Chrome için gerekli izinleri veriyoruz.
    // headless: true
  });
  const page = await browser.newPage();

  // Hedef sayfayı ziyaret ediyoruz.
  await page.goto('https://canlipiyasalar.haremaltin.com/', { waitUntil: 'networkidle2' });

  // Verileri çekme fonksiyonunu tanımlıyoruz.
  const fetchData = async () => {
    try {
      // 1) ALTIN FİYATLARI (ilk tablo: isim, alış, satış)
      const altinVeriler = await page.$$eval('table.table:nth-of-type(1) tr', rows => {
        // Hariç tutulacak isimlerin listesi (BÜYÜK HARF ile kontrol edilecek)
        const exclusionList = [
          "USD/KG",
          "EUR/KG",
          "ONS",
          "ESKİÇEYREK",
          "ESKİYARIM",
          "ESKİTAM",
          "ESKİ ATA",
          "ESKİ GREMSE",
          "ALTINGÜMÜŞ",
          "YENİ ATA5",
          "ESKİ ATA5",
        ];
        return rows.map(row => {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 3) {
            const rawName = cells[0].textContent.trim();
            // İsim dönüşüm fonksiyonu:
            function transformName(name) {
              // "YENİÇEYREK" ise "ÇEYREK ALTIN" olarak değiştir
              if(name.toUpperCase() === "YENİÇEYREK") {
                return "ÇEYREK ALTIN";
              }

              if(name.toUpperCase() === "YENİYARIM") {
                return "YARIM ALTIN";
              }

              if(name.toUpperCase() === "YENİTAM") {
                return "TAM ALTIN";
              }

              if(name.toUpperCase() === "YENİATA") {
                return "ATA LİRA";
              }

              if(name.toUpperCase() === "YENİGREMSE") {
                return "GREMSE ALTIN";
              }

              // "ALTIN" kelimesinden önce boşluk ekle (eğer yoksa)
              name = name.replace(/(ALTIN)/i, ' $1').trim();
              name = name.replace(/(ATA)/i, ' $1').trim();
              name = name.replace(/(GREMSE)/i, ' $1').trim();
              name = name.replace(/(TL)/i, ' $1').trim();
              // Rakam ile harf arasına boşluk ekle
              name = name.replace(/(\d)([A-ZÇĞİÖŞÜ])/gi, '$1 $2');
              return name;
            }
            return {
              isim: transformName(rawName),
              alis: cells[1].textContent.trim(),
              satis: cells[2].textContent.trim(),
            };
          }
          return null;
        })
        .filter(Boolean)
        .slice(0, 21)
        // Dönüştürülmüş isimleri büyük harfe çevirerek kontrol edelim
        .filter(item => !exclusionList.includes(item.isim.toUpperCase()));
      });

      // 2) DARBHANE İŞÇİLİK FİYATLARI (ikinci tablo: isim, yeniAlis, yeniSatis, eskiAlis, eskiSatis)
      // const darphaneVeriler = await page.$$eval('table.table:nth-of-type(1) tr', rows => {
      //   return rows.map(row => {
      //     const cells = row.querySelectorAll('td');
      //     if (cells.length >= 5) {
      //       const isimLink = cells[0].querySelector('a.item.title');
      //       const rawName = isimLink ? isimLink.textContent.trim() : cells[0].textContent.trim();
      //       // Aynı dönüşümü (isteğe bağlı, eğer darphane verilerinde de isimde boşluk isteniyorsa)
      //       function transformName(name) {
      //         if(name.toUpperCase() === "YENİÇEYREK") {
      //           return "ÇEYREK ALTIN";
      //         }
      //         name = name.replace(/(ALTIN)/i, ' $1').trim();
      //         name = name.replace(/(\d)([A-ZÇĞİÖŞÜ])/gi, '$1 $2');
      //         return name;
      //       }
      //       return {
      //         isim: transformName(rawName),
      //         yeniAlis: cells[1].textContent.trim(),
      //         yeniSatis: cells[2].textContent.trim(),
      //         eskiAlis: cells[3].textContent.trim(),
      //         eskiSatis: cells[4].textContent.trim(),
      //       };
      //     }
      //     return null;
      //   }).filter(Boolean);
      // });

      // Global değişkeni güncelliyoruz.
      scrapedData = { altinVeriler };
    } catch (err) {
      console.error('Veri çekme hatası:', err);
    }
  };

  // İlk veriyi hemen çekiyoruz
  await fetchData();
  // Sonrasında her 5 saniyede bir verileri güncelliyoruz.
  setInterval(fetchData, 3000);
  // Tarayıcıyı kapatmıyoruz; böylece sürekli veri çekmeye devam ediyoruz.
})();

// Express sunucusuna statik dosyaların bulunduğu klasörü tanımlıyoruz.
app.use(express.static('public'));

// API endpoint'i: en güncel verileri JSON formatında döndürüyor.
app.get('/api/data', (req, res) => {
  res.json(scrapedData);
});

app.listen(port, () => {
  console.log(`Sunucu http://localhost:${port} adresinde çalışıyor`);
});
