const express = require("express");
const puppeteer = require("puppeteer");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

let scrapedData = {
  altinVeriler: [],
};

let browser;
let page;

// Yardımcı fonksiyonlar
function parsePrice(str) {
  return parseFloat(str.replace(/\./g, "").replace(",", "."));
}

function formatPrice(num) {
  if (typeof num !== "number" || isNaN(num)) return "";
  let parts = num.toFixed(2).split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return parts.join(",");
}

// Puppeteer'ı başlatırken protocolTimeout değerini artırdık ve headless ayarını güncelledik.
const initializePuppeteer = async () => {
  try {
    if (browser) await browser.close();
    browser = await puppeteer.launch({
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--single-process",
        "--no-zygote",
      ],
      headless: true,                // "shell" yerine true kullanıldı (standart headless mod)
      protocolTimeout: 30000,          // 30 saniyeye çıkarıldı. (Varsayılan süre yetersiz kalıyorsa)
    });
    page = await browser.newPage();
    
    // Eğer sayfa kapanmışsa ya da oluşturulmamışsa, yeniden deniyoruz
    if (!page || page.isClosed()) {
      page = await browser.newPage();
    }
    
    await page.goto("https://canlipiyasalar.haremaltin.com/", {
      waitUntil: "networkidle2",
      timeout: 0,
    });
    
    // Sayfa hata durumlarını dinlemek için ek event listener
    page.on("error", (err) => {
      console.error("Sayfa hatası:", err);
    });
  } catch (err) {
    console.error("Puppeteer başlatma hatası:", err);
  }
};

const fetchData = async () => {
  try {
    // Eğer page tanımlı değilse veya kapalıysa, yeniden başlatıyoruz
    if (!page || page.isClosed()) {
      await initializePuppeteer();
    }

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

          name = name.replace(/(ALTIN)/i, " $1").trim();
          name = name.replace(/(ATA)/i, " $1").trim();
          name = name.replace(/(GREMSE)/i, " $1").trim();
          name = name.replace(/(TL)/i, " $1").trim();
          name = name.replace(/(\d)([A-ZÇĞİÖŞÜ])/gi, "$1 $2");
          return name;
        }

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
          .slice(0, 21)
          .filter((item) => !exclusionList.includes(item.isim.toUpperCase()));
      }
    );

    let hasAlis = 0;
    let hasSatis = 0;

    const hasAltinRow = altinVeriler.find(
      (row) => row.isim.toUpperCase() === "HAS ALTIN"
    );
    if (hasAltinRow) {
      hasAlis = parsePrice(hasAltinRow.alisStr);
      hasSatis = parsePrice(hasAltinRow.satisStr);
    }

    const finalAltinVeriler = altinVeriler
      .filter((row) => row.isim.toUpperCase() !== "HAS ALTIN")
      .filter((row) => row.isim.toUpperCase() !== "ATA LİRA")
      .map((row) => {
        let alisNum = parsePrice(row.alisStr);
        let satisNum = parsePrice(row.satisStr);

        switch (row.isim.toUpperCase()) {
          case "24 AYAR":
            satisNum = hasSatis * 1.02;
            break;
          case "22 AYAR":
            satisNum = hasSatis * 0.945;
            break;
          case "ÇEYREK ALTIN":
            alisNum = hasAlis * 1.6;
            satisNum = hasSatis * 1.65;
            break;
          case "YARIM ALTIN":
            alisNum = hasAlis * 3.2;
            satisNum = hasSatis * 3.3;
            break;
          case "TAM ALTIN":
            alisNum = hasAlis * 6.4;
            satisNum = hasSatis * 6.6;
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
          kkSatis: formatPrice(satisNum * 1.04),
        };
      });

    finalAltinVeriler.sort((a, b) => {
      const nameA = a.isim.toUpperCase();
      const nameB = b.isim.toUpperCase();
      if (nameA === "24 AYAR" && nameB === "22 AYAR") return -1;
      if (nameA === "22 AYAR" && nameB === "24 AYAR") return 1;
      return 0;
    });

    const tamIndex = finalAltinVeriler.findIndex(
      (item) => item.isim.toUpperCase() === "TAM ALTIN"
    );

    if (hasAlis && hasSatis) {
      const resatAltin = {
        isim: "REŞAT ALTIN",
        alis: formatPrice(hasAlis * 6.63),
        satis: formatPrice(hasSatis * 6.95),
        kkSatis: formatPrice(hasSatis * 6.95 * 1.04),
      };
      const hamidAltin = {
        isim: "HAMİT ALTIN",
        alis: formatPrice(hasAlis * 6.6),
        satis: formatPrice(hasSatis * 6.8),
        kkSatis: formatPrice(hasSatis * 6.8 * 1.04),
      };
      const ataLira = {
        isim: "ATA LİRA",
        alis: formatPrice(hasAlis * 6.6),
        satis: formatPrice(hasSatis * 6.8),
        kkSatis: formatPrice(hasSatis * 6.8 * 1.04),
      };

      if (
        !finalAltinVeriler.some((item) => item.isim.toUpperCase() === "REŞAT ALTIN")
      ) {
        if (tamIndex !== -1) {
          finalAltinVeriler.splice(tamIndex + 1, 0, resatAltin);
        } else {
          finalAltinVeriler.push(resatAltin);
        }
      }

      if (
        !finalAltinVeriler.some((item) => item.isim.toUpperCase() === "HAMİT ALTIN")
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

      if (
        !finalAltinVeriler.some((item) => item.isim.toUpperCase() === "ATA LİRA")
      ) {
        const hamidIndex = finalAltinVeriler.findIndex(
          (item) => item.isim.toUpperCase() === "HAMİT ALTIN"
        );
        if (hamidIndex !== -1) {
          finalAltinVeriler.splice(hamidIndex + 1, 0, ataLira);
        } else {
          finalAltinVeriler.push(ataLira);
        }
      }
    }

    scrapedData.altinVeriler = finalAltinVeriler;
  } catch (err) {
    console.error("Veri çekme hatası:", err);
    // Hata durumunda Puppeteer'ı yeniden başlatarak target closed hatasını aşmayı deniyoruz.
    await initializePuppeteer();
  }
};

(async () => {
  await initializePuppeteer();
  await fetchData();
  setInterval(fetchData, 60000);
})();

app.use(express.static("public"));

app.get("/api/data", (req, res) => {
  res.json(scrapedData);
});

app.listen(port, () => {
  console.log(`Sunucu http://localhost:${port} adresinde çalışıyor`);
});
