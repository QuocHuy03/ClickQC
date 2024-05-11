const { Builder, By, until } = require("selenium-webdriver");
const chrome = require("selenium-webdriver/chrome");
const fs = require("fs");
const axios = require("axios");
const requestCountFile = "requestCount.json";

function readRequestCountFromFile() {
  try {
    const data = fs.readFileSync(requestCountFile, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    return { count: 0 };
  }
}

async function updateRequestCount() {
  const requestData = readRequestCountFromFile();
  requestData.count++;

  if (requestData.count >= 1) {
    await getNewProxy();
    requestData.count = 0;
  }

  fs.writeFileSync(requestCountFile, JSON.stringify(requestData));
}

function readProxiesFromFile(filename) {
  try {
    const data = fs.readFileSync(filename, "utf8");
    const proxies = data
      .trim()
      .split("\n")
      .map((proxy) => {
        const [server, type] = proxy.split("-");
        return { server, type };
      });
    return proxies;
  } catch (error) {
    console.error("Error reading proxies from file:", error.message);
    return [];
  }
}

async function runScraping() {
  const keywords = fs.readFileSync("keywords.txt", "utf-8").split("\n");
  const proxies = readProxiesFromFile("proxy.txt");
  const proxy = proxies[Math.floor(Math.random() * proxies.length)];

  const chromeOptions = new chrome.Options();
  chromeOptions.addArguments(`--proxy-server=http://${proxy.server}`);
  chromeOptions.addArguments("--disable-blink-features=AutomationControlled");
  chromeOptions.addArguments(
    `--window-size=${this.windowWidth},${this.windowHeight}`
  );

  const driver = new Builder()
    .forBrowser("chrome")
    .setChromeOptions(chromeOptions)
    .build();

  try {
    for (const keyword of keywords) {
      // Tìm kiếm từ khóa trên Google
      await driver.get(
        `https://www.google.com/search?q=${encodeURIComponent(keyword)}`
      );
      const searchResults = await driver.findElements(By.css("a.sVXRqc"));
      const results = [];
      for (const result of searchResults) {
        const href = await result.getAttribute("href");
        const dataRw = await result.getAttribute("data-rw");
        results.push({ href, dataRw });
      }
      console.log("Tên Miền Tìm Kiếm Có SEO : ", results);

      const dataDomains = fs
        .readFileSync("data.txt", "utf-8")
        .split("\n")
        .map((domain) => domain.trim())
        .filter((domain) => domain !== "");

      const getHostname = (url) => {
        return new URL(url).hostname;
      };

      const matchedDomains = results.filter((result) => {
        const hostnameA = getHostname(result.href);
        return dataDomains.some((domain) => {
          const hostnameB = getHostname(domain);
          return hostnameA === hostnameB;
        });
      });

      console.log("Tên Miền Đã Được Lọc :", matchedDomains);
      const requestData = readRequestCountFromFile();
      if (requestData.count < 1) {
        const pagePromises = matchedDomains.map(async (matchedDomain) => {
          const newPage = await new Builder()
            .forBrowser("chrome")
            .setChromeOptions(chromeOptions)
            .build();
          await newPage.get(matchedDomain.dataRw);
          return newPage;
        });
        const pages = await Promise.all(pagePromises);

        await Promise.all(
          pages.map(async (page) => {
            const startTime = new Date().getTime();

            while (new Date().getTime() - startTime < 15000) {
              const { scrollHeight } = await page.executeScript(
                "return document.body.scrollHeight"
              );
              await page.executeScript(`window.scrollTo(0, ${scrollHeight});`);
              await page.sleep(1000);
            }
            const startTimeUp = new Date().getTime();

            while (new Date().getTime() - startTimeUp < 15000) {
              await page.executeScript("window.scrollTo(0, 0);");
              await page.sleep(1000);
            }

            console.log(
              "Đã cuộn xuống cuối trang và cuộn lên đầu trang trong khoảng 15 giây."
            );
            await page.quit();
          })
        );

        await updateRequestCount();
      } else {
        console.log("Proxy has reached request limit, getting a new one...");
        await getNewProxy();
        requestData.count = 0;
        fs.writeFileSync(requestCountFile, JSON.stringify(requestData));
      }
    }
  } catch (error) {
    console.error("Error occurred:", error.message);
  } finally {
    await driver.quit();
  }
}

async function getNewProxy() {
  const url = "https://tmproxy.com/api/proxy/get-new-proxy";
  const payload = {
    api_key: "c1fad07a5505486608dbfced37e65b30",
    sign: "c1fad07a5505486608dbfced37e65b30",
    id_location: 0,
  };

  try {
    const response = await axios.post(url, payload);
    const data = response.data;

    if (data.code === 0) {
      fs.writeFileSync("proxy.txt", data.data.https + "-https");
      console.log("Proxy updated successfully", data.message);
    } else if (data.code === 5) {
      const nextRequestTime = data.data.next_request * 1000; // Đổi từ giây sang mili giây
      // timeout = nextRequestTime;
      console.log(`Chờ ${nextRequestTime} ms trước khi thử lại.`);
    } else {
      console.error("Error:", data);
    }
  } catch (error) {
    console.error("Error occurred:", error.message);
  }
}

getNewProxy();
async function main() {
  for (let i = 0; i < 10; i++) {
    try {
      await runScraping();
    } catch (error) {
      console.error("Error occurred:", error.message);
    }
  }
}

main();
