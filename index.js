// Importation de bibliothèques
    const { chromium } = require('playwright'); // Navigateur 
    const fs = require('fs'); // Gestion des fichiers
    const path = require('path');
    const { Parser } = require('json2csv'); // Convertir JSON en CSV
//


// Config
    // Récupérer l'argument passé (nom du fichier de config)
    const DefaultConfigFile = 'default.json';
    const ConfigFileName = process.argv[3] || DefaultConfigFile;
    const ConfigFilePath = path.resolve(__dirname, 'config', ConfigFileName);
    
    // Vérifier si le fichier de configuration existe
    if (!fs.existsSync(ConfigFilePath)) {
        console.error(`Erreur : Le fichier de configuration "${ConfigFileName}" n'existe pas.`);
        process.exit(1); // Quitter le programme
    }

    const config = require(ConfigFilePath);

    const IsHeadless = config.isHeadless;
    const StartPageNumber = config.startPage;
    const EndPageNumber = config.endPage;
    const FilePath = config.filePath;
    const FileName = config.fileName;
    const PauseTime = config.pauseTime;
    const Url = config.url;
    const UrlArg = config.urlArgument;

    
// Selectors sur la page google
    const Selectors = {
        selectorDomArticles: "#rso > div > div > div",
        selectorLink: "a",
        selectorTitle: ".SoAPf div:nth-child(2)",
        selectorNewsPaper: ".SoAPf div:nth-child(1) span",
        selectorResume: ".SoAPf div:nth-child(3)",
        selectorDate: ".SoAPf div:nth-child(5)"
    }
//

// selecteur bouton refuser cookies
    const SelectorCookiesDeny = 'button[aria-label="Tout refuser"]';
//

// ------------------------- Fonctions -------------------------

// Récupère l'url et la coupe en deux autour de l'argument à faire varier
async function splitUrl(url, arg) {
    const startIndex = url.indexOf('&'+arg);
    let baseUrl = "";
    let endUrl = ""; 
        

    // Si "{arg}=" existe dans l'URL, on divise
    if (startIndex !== -1) {
        baseUrl = url.substring(0, startIndex + arg.length + 2);
        endUrl = url.substring(url.indexOf('&', startIndex + arg.length + 2)); 
        
        // Résultat
        console.log('Start Part:', baseUrl);
        console.log('End Part:', endUrl);
    } else {
        baseUrl = url+"&"+arg+"=";
        endUrl = ""; 
        console.log('Paramètre "'+arg+'=" non trouvé dans l\'URL.');
        console.log('New Start Part:', baseUrl);
        console.log('New End Part:', endUrl);
    }

    return {start:baseUrl, end:endUrl};
}

// Fonction pour gérer les cookies
async function handleCookies(page) {
    console.log("Gestion des cookies.");
    try {
        await page.waitForSelector(SelectorCookiesDeny, { timeout: 5000 });
        await page.click(SelectorCookiesDeny);
        console.log("Formulaire de cookies géré avec succès.");
    } catch (error) {
        console.warn("Formulaire de cookies non détecté ou déjà géré.");
    }
    await page.waitForTimeout(PauseTime); // Pause de 2 secondes
}

async function scrapeArticlesFromPage(page) {
    return await page.evaluate(
        ({ Selectors }) => {
            const domArticles = document.querySelectorAll(Selectors.selectorDomArticles);
            return Array.from(domArticles).map(element => ({
                Date: element.querySelector(Selectors.selectorDate)?.textContent || null,
                Titre: element.querySelector(Selectors.selectorTitle)?.textContent || null,
                Media: element.querySelector(Selectors.selectorNewsPaper)?.textContent || null,
                Resume: element.querySelector(Selectors.selectorResume)?.textContent || null,
                Lien: element.querySelector(Selectors.selectorLink)?.href || null,
            }));
        },
        { Selectors }
    );
}

function saveToCSV(data) {
    const parser = new Parser();
    const csv = parser.parse(data);
    let name = FilePath+FileName+"_s"+StartPageNumber+"_e"+EndPageNumber+".csv";
    fs.writeFileSync(name, csv, 'utf-8');
    console.log(`Fichier CSV généré : ${name}`);
}

// Fonction pour naviguer vers une URL et extraire les articles
async function scrapePage(page, url, handleCookiesOnFirstPage) {
    console.log(`Naviguer vers l'URL : ${url}`);

    await page.goto(url);
    await page.waitForTimeout(PauseTime);

    if (handleCookiesOnFirstPage) {
        await handleCookies(page);
    }

    console.log(`Récupération des données pour l'URL : ${url}`);
    const articles = await scrapeArticlesFromPage(page);
    console.log(`Articles extraits : ${articles.length}`);
    await page.waitForTimeout(PauseTime); // Pause de 2 secondes
    return articles;
}

// ------------------------- Fin fonctions -------------------------


(async () => {
    const browser = await chromium.launch({ headless: IsHeadless });
    const context = await browser.newContext();
    const page = await context.newPage();
    let allArticles = [];
    let isFirstPage = false;

    // Split Url
    const UrlSplited = await splitUrl(Url, UrlArg);
    const BaseUrl = UrlSplited.start;
    const EndUrl = UrlSplited.end;


    for (let pageNumber = StartPageNumber; pageNumber <= EndPageNumber; pageNumber++) {
        const start = (pageNumber - 1) * 10; // Calculer le paramètre 'start' pour l'URL
        const url = BaseUrl+start+EndUrl;

        if(pageNumber === StartPageNumber){isFirstPage = true;}
        else {isFirstPage = false}

        const articles = await scrapePage(page, url, isFirstPage);
        console.log(`Articles extraits de la page ${pageNumber}: ${articles.length}`);
        allArticles = allArticles.concat(articles); 
    }

    saveToCSV(allArticles);
    await browser.close();
})();
