const express = require("express");
const puppeteer = require("puppeteer");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

let scrapedData = {
  altinVeriler: [],
};

// 1) Yardımcı fonksiyonlar
function parsePrice(str) {
  // "3.383,90" → 3383.90
  return parseFloat(str.replace(/\./g, "").replace(",", "."));
}

function formatPrice(num) {
  // 3399437.80 → "3.399.437,80"
  if (typeof num !== "number" || isNaN(num)) return "";
  let parts = num.toFixed(2).split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return parts.join(",");
}

(async () => {
  // Puppeteer başlat
  const browser = await puppeteer.launch({
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--single-process",
      "--no-zygote",
    ],
    // headless: true
  });
  const page = await browser.newPage();

  // Hedef sayfayı ziyaret et
  await page.goto("https://canlipiyasalar.haremaltin.com/", {
    waitUntil: "networkidle2",
  });

  // Tablodaki verileri çek
  const fetchData = async () => {
    try {
      const altinVeriler = await page.$$eval(
        "table.table:nth-of-type(1) tr",
        (rows) => {
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
            "14 AYAR",
          ];

          function transformName(name) {
            if (name.toUpperCase() === "YENİÇEYREK") return "ÇEYREK ALTIN";
            if (name.toUpperCase() === "YENİYARIM") return "YARIM ALTIN";
            if (name.toUpperCase() === "YENİTAM") return "TAM ALTIN";
            if (name.toUpperCase() === "YENİATA") return "ATA LİRA";
            if (name.toUpperCase() === "YENİGREMSE") return "GREMSE ALTIN";
            if (name.toUpperCase() === "GRAMALTIN") return "24 AYAR";

            // "ALTIN", "ATA" vb. kelimeleri ayrıştırma
            name = name.replace(/(ALTIN)/i, " $1").trim();
            name = name.replace(/(ATA)/i, " $1").trim();
            name = name.replace(/(GREMSE)/i, " $1").trim();
            name = name.replace(/(TL)/i, " $1").trim();
            // Rakam ile harf arasına boşluk
            name = name.replace(/(\d)([A-ZÇĞİÖŞÜ])/gi, "$1 $2");
            return name;
          }

          // Her satır için: isim, alış, satış
          return rows
            .map((row) => {
              const cells = row.querySelectorAll("td");
              if (cells.length >= 3) {
                const rawName = cells[0].textContent.trim();
                const alisStr = cells[1].textContent.trim();
                const satisStr = cells[2].textContent.trim();

                return {
                  isim: transformName(rawName),
                  alisStr,
                  satisStr,
                };
              }
              return null;
            })
            .filter(Boolean)
            .slice(0, 21) // İlk 21 satırı al
            .filter((item) => !exclusionList.includes(item.isim.toUpperCase()));
        }
      );

      // 2) İlk aşamada verileri diziye koyduk.
      //    Şimdi Has Altın'ı bulup alis/satis değerlerini saklayacağız.
      let hasAlis = 0;
      let hasSatis = 0;

      // "Has Altın" satırını bul
      const hasAltinRow = altinVeriler.find(
        (row) => row.isim.toUpperCase() === "HAS ALTIN"
      );
      if (hasAltinRow) {
        hasAlis = parsePrice(hasAltinRow.alisStr);
        hasSatis = parsePrice(hasAltinRow.satisStr);
      }

      // 3) Her satır için hesaplamaları yapalım
      // Final hesaplamaları yapıp "HAS ALTIN" satırını sonuç listesine eklemiyoruz:
      const finalAltinVeriler = altinVeriler
        .filter((row) => row.isim.toUpperCase() !== "HAS ALTIN")
        .filter((row) => row.isim.toUpperCase() !== "ATA LİRA")
        .map((row) => {
          let alisNum = parsePrice(row.alisStr);
          let satisNum = parsePrice(row.satisStr);

          switch (row.isim.toUpperCase()) {
            case "24 AYAR":
              alisNum = alisNum;
              satisNum = hasSatis * 1.012;
              break;
            case "22 AYAR":
              alisNum = alisNum;
              satisNum = hasSatis * 0.945;
              break;
            case "ÇEYREK ALTIN":
              alisNum = hasAlis * 1.6;
              satisNum = hasSatis * 1.64;
              break;
            case "YARIM ALTIN":
              alisNum = hasAlis * 3.2;
              satisNum = hasSatis * 3.28;
              break;
            case "TAM ALTIN":
              alisNum = hasAlis * 6.4;
              satisNum = hasSatis * 6.56;
              break;
            case "GREMSE ALTIN":
              alisNum = hasAlis * 16;
              satisNum = hasSatis * 16.4;
              break;
            case "GÜMÜŞ TL":
              alisNum = alisNum - 0.45;
              satisNum = satisNum + 1;
              break;
            default:
              break;
          }

          return {
            isim: row.isim,
            alis: formatPrice(alisNum),
            satis: formatPrice(satisNum),
          };
        });

      // 4) "24 AYAR" ve "22 AYAR" satırlarının sıralamasını değiştirelim:
      // "24 AYAR" verisinin "22 AYAR" verisinden önce gelmesini istiyoruz.
      finalAltinVeriler.sort((a, b) => {
        const nameA = a.isim.toUpperCase();
        const nameB = b.isim.toUpperCase();
        if (nameA === "24 AYAR" && nameB === "22 AYAR") return -1;
        if (nameA === "22 AYAR" && nameB === "24 AYAR") return 1;
        return 0;
      });
      
      // "REŞAT ALTIN" ve "HAMID ALTIN" verilerini, "TAM ALTIN" satırının hemen sonrasına ekleyelim.
      if (hasAlis && hasSatis) {
        const resatAltin = {
          isim: "REŞAT ALTIN",
          alis: formatPrice(hasAlis * 6.63),
          satis: formatPrice(hasSatis * 6.95),
        };
        const hamidAltin = {
          isim: "HAMİD ALTIN",
          alis: formatPrice(hasAlis * 6.6),
          satis: formatPrice(hasSatis * 6.8),
        };

        // "TAM ALTIN" satırının indeksini bulalım
        const tamIndex = finalAltinVeriler.findIndex(
          (item) => item.isim.toUpperCase() === "TAM ALTIN"
        );

        // Eğer "REŞAT ALTIN" henüz eklenmediyse, TAM ALTIN'ın hemen sonrasına ekleyelim
        if (
          !finalAltinVeriler.some(
            (item) => item.isim.toUpperCase() === "REŞAT ALTIN"
          )
        ) {
          if (tamIndex !== -1) {
            finalAltinVeriler.splice(tamIndex + 1, 0, resatAltin);
          } else {
            finalAltinVeriler.push(resatAltin);
          }
        }
        // "HAMID ALTIN" için; eğer "REŞAT ALTIN" eklenmişse onun hemen sonrasına, aksi takdirde TAM ALTIN'ın sonrasına ekleyelim
        if (
          !finalAltinVeriler.some(
            (item) => item.isim.toUpperCase() === "HAMID ALTIN"
          )
        ) {
          const resatIndex = finalAltinVeriler.findIndex(
            (item) => item.isim.toUpperCase() === "REŞAT ALTIN"
          );
          if (resatIndex !== -1) {
            finalAltinVeriler.splice(resatIndex + 1, 0, hamidAltin);
          } else if (tamIndex !== -1) {
            finalAltinVeriler.splice(tamIndex + 1, 0, hamidAltin);
          } else {
            finalAltinVeriler.push(hamidAltin);
          }
        }
      }

      scrapedData.altinVeriler = finalAltinVeriler;
    } catch (err) {
      console.error("Veri çekme hatası:", err);
    }
  };

  await fetchData();
  setInterval(fetchData, 60000);

  // Sunucuyu kapatmıyoruz; Puppeteer arka planda çalışmaya devam etsin
})();

app.use(express.static("public"));

app.get("/api/data", (req, res) => {
  res.json(scrapedData);
});

app.listen(port, () => {
  console.log(`Sunucu http://localhost:${port} adresinde çalışıyor`);
});
