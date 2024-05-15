// ==UserScript==
// @name        For www.as-books.jp
// @namespace   Violentmonkey Scripts
// @match       https://www.as-books.jp/trhtml5_ssl/view/*
// @match       https://lib.as-books.jp/html5_ssl/view/*
// @grant       none
// @version     1.1
// @author      -
// @description 15.05.2024, 15:00:00
// @noframes
// @run-at      document-idle
// ==/UserScript==

const bookState = {
    baseHref: '',
    baseFileHref: '',
    iframe: null,
    printButtonEl: null,
    total: 0,
    imagesFolder: '/books/images',
    resolvedImages: [],
}

const getPrintButtonDefaultText = () =>
    `Распечатать: ${bookState.total} стр.`

const getPrintButtonProgressText = (count) =>
    `Загрузка... ${count} \/ ${bookState.total} стр.`

function addPrintStyleInDoc(document) {
    const printStyles = `
    @media print {
      @page {
        size: auto;
        margin: 0mm;
      }

      body {
        margin: 0;
        padding: 0;
      }

      img {
        display: block;
        max-width: 100%;
      }
    }
`

    const printStyleEl = document.createElement('style')
    printStyleEl.innerHTML = printStyles;
    document.body.appendChild(printStyleEl)
}

function getImagePath(quality, fileName) {
    return `${bookState.baseFileHref}${bookState.imagesFolder}/${quality}/${fileName}.jpg`
}

async function checkImageAvailability() {
    const qualities = [4, 3, 2, 1]; // Порядок качества от лучшего к худшему
    const fileName = '1';

    for (let i = 0; i < qualities.length; i++) {

        const quality = qualities[i]
        const path = getImagePath(quality, fileName);
        const response = await fetch(path, {method: 'HEAD'});

        if (response.ok && response.status !== 302 && response.headers.get('Content-type') !== 'text/html') {
            console.log(`[book-to-PDF] Качество изображений: ${quality}\/${qualities[0]}.`)
            return quality;
        }
    }

    console.log(`[book-to-PDF] Файл ${fileName} отсутствует во всех качествах.`);
    return null;
}

async function addImagesInDoc(document) {
    let imgLoadedCounter = 0;
    const imageWrapperEl = document.createElement('div');

    const quality = await checkImageAvailability();

    if (!quality) {
        console.error('[book-to-PDF] Проверочное изображение не найдено.')
        return false
    }


    const imagePaths =
        [...new Array(bookState.total)].map((_, index) => getImagePath(quality, index + 1));

    await Promise.all(imagePaths.map((path) =>
        new Promise((resolve, reject) => {
            const img = new Image();
            imageWrapperEl.appendChild(img)
            img.onload = () => {
                bookState.printButtonEl.textContent = getPrintButtonProgressText(++imgLoadedCounter);
                resolve(path);
            };
            img.onerror = () => {
                reject(path);
            };
            img.src = path;
        })
    )).then(function () {
        console.log("[book-to-PDF] Все изображения успешно загружены.");
    }).catch(function (error) {
        console.error("[book-to-PDF] Ошибка загрузки изображений:", error);
        return false
    });

    document.body.appendChild(imageWrapperEl)

    return true
}

window.App = new Proxy(window.App, {
    set(_, prop, book) {
        if (prop === 'book' && book?.lastPage) {
            initBookPrinter(book)
        }

        return Reflect.set(...arguments)
    }
});

function createIframe(onAppend) {
    if (bookState.iframe) {
        onAppend(true)
        return
    }

    bookState.iframe = document.createElement('iframe');
    bookState.iframe.src = 'about:blank';
    bookState.iframe.hidden = true;
    bookState.iframe.onload = async () => {
        const iframeDoc = bookState.iframe.contentWindow.document;

        const isCompleteImages = await addImagesInDoc(iframeDoc)
        addPrintStyleInDoc(iframeDoc)

        onAppend(isCompleteImages)
    };

    bookState.iframe.onerror = (e) => {
        onAppend(false);
        console.error("[book-to-PDF] Ошибка создания iframe: ", e);
    }

    document.body.appendChild(bookState.iframe);
}

async function handlePrint() {
    bookState.printButtonEl.textContent = getPrintButtonProgressText(0)

    createIframe((status) => {
        bookState.printButtonEl.textContent = getPrintButtonDefaultText()
        status && bookState.iframe.contentWindow.print()
    })
}


function getPrintButton() {
    const button = document.createElement("button");
    button.textContent = getPrintButtonDefaultText()

    Object.assign(button.style, {
        position: 'absolute',
        zIndex: 100,
        top: '20px',
        right: '20px',
        padding: "10px 20px",
        backgroundColor: "#007bff",
        color: "#fff",
        width: '300px',
        border: "none",
        borderRadius: "5px",
        cursor: "pointer",
        fontSize: "16px",
        boxShadow: '0 1px 3px 1px rgba(0, 0, 0, .3)'
    });

    button.onclick = () => {
        handlePrint()
    }

    return button
}

async function initBookPrinter(book) {
    bookState.baseHref = document.querySelector('base')?.href?.replace('/HTML5/', '');

    if (!bookState.baseHref) return

    // fix url for free book
    bookState.baseFileHref = bookState.baseHref.replace('/trbook_html_ssl/', '/trfileread_html_ssl/read.php?f=')

    // const xml = await fetch(bookState.baseHref + '/iPhone/ibook.xml').then(res => res.text())
    // const total = Number(xml?.match(/<total>(.*?)<\/total>/i)?.[1]) || null
    bookState.total = book?.lastPage || 0;

    if (!bookState.total) return

    bookState.printButtonEl = getPrintButton()
    document.body.appendChild(bookState.printButtonEl);
}
